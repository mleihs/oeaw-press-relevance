'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiHeaders } from '@/lib/client/stores/settings-store';
import { consumeSSE } from '@/lib/client/sse';
import { DEFAULT_LLM_MODEL, LLM_MODELS } from '@/lib/shared/constants';
import { SCORING_RECENT_DAYS } from '@/lib/shared/dashboard';
import type { ScoringEntity } from '@/lib/shared/scoring/entity';
import {
  ProgressDialogShell,
  PhaseTransition,
  PhaseStepper,
  ForceCheckbox,
  StartRunButton,
  RunProgressBar,
  MetricGrid,
  Metric,
  ElapsedLine,
  RunWarning,
  RunningHint,
  DoneSection,
  SkippedSection,
  ErrorSection,
  useElapsedSeconds,
  type ProgressPhase,
  type ProgressStepDef,
} from '@/components/progress-dialog-shell';
import { Button } from '@/components/ui/button';
import { Database, Brain, Sparkles, Newspaper, CalendarDays } from '@/lib/icons';

// Gemeinsames „Bewerten"-Modal für Publikationen UND Events, strukturell der
// Zwilling von app/social/_components/refresh-button.tsx („aus einem Guss"):
// die geteilte Optik (getinteter Kopf, 3-Phasen-Stepper, Live-Metriken,
// Desktop-Dialog / Mobile-Drawer) lebt in components/progress-dialog-shell.tsx;
// hier bleiben Domänen-Copy, Endpunkte und die Interpretation der SSE-Frames
// (Protokoll: lib/server/scoring/button.ts).
//
// Der Knopf startet einen Lauf des Bewertungskerns: Anthropic direkt, Opus,
// Effort max, mit Haiku-Prüfung und Lektorat. Eine Modellwahl gibt es nicht,
// bewertet wird mit dem Modell, gegen das kalibriert ist. Controlled
// (open/onOpenChange), damit Dashboard-Kachel, Publikations- und Events-Seite
// dieselbe Komponente teilen.

type Step = 'load' | 'score' | 'finish' | null;

const MODEL_LABEL = LLM_MODELS.find((m) => m.value === DEFAULT_LLM_MODEL)?.label ?? DEFAULT_LLM_MODEL;

interface Counts {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  tokens: number;
  cost: number;
  /** Ausdrücklich benannte Einträge, die an den Bewertbarkeits-Gates hingen. */
  skipped: number;
  /** Haikus, die auch nach zwei Nachforderungen die Silbenprüfung nicht hielten. */
  haikuRejected: number;
  /** Maschinelle Befunde, die nach dem Lektorat übrig blieben. */
  lektoratFlags: number;
  /** Datensätze, deren Texte das Lektorat umgeschrieben hat. */
  lektoratChanges: number;
  /** Kostendeckel je Lauf in USD (aus dem init-Frame) und ob er griff. */
  costCapUsd: number | null;
  costCapHit: boolean;
}
const ZERO: Counts = {
  total: 0, processed: 0, successful: 0, failed: 0, tokens: 0, cost: 0, skipped: 0,
  haikuRejected: 0, lektoratFlags: 0, lektoratChanges: 0, costCapUsd: null, costCapHit: false,
};

/** „2 Haikus verworfen · 1 Lektorat-Hinweis · 4 lektoriert", leer ohne Befund. */
function qualityLine(c: Counts): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [
    c.haikuRejected > 0 && `${plural(c.haikuRejected, 'Haiku', 'Haikus')} verworfen`,
    c.lektoratFlags > 0 && plural(c.lektoratFlags, 'Lektorat-Hinweis', 'Lektorat-Hinweise'),
    c.lektoratChanges > 0 && `${c.lektoratChanges} lektoriert`,
    c.costCapHit && `Kostendeckel${c.costCapUsd ? ` (${c.costCapUsd} USD)` : ''} erreicht`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Die drei Copy-Zeilen, in denen sich Sammellauf und Einzelbewertung
 *  unterscheiden. Alles andere (Endpunkt, Deckel, Icon, Begründung) hängt an
 *  der Entität, nicht am Modus. */
interface ModeCopy {
  title: string;
  description: string;
  /** Eine Zeile unter der Modellzeile: was dieser Lauf konkret erfasst. */
  scopeNote: string;
}

interface EntityConfig {
  endpoint: string;
  /** Sicherheitsdeckel pro Sammellauf. Den Scope bestimmt der Server
   *  (Kandidaten-View + Zeitfenster), nicht diese Zahl. Bei einer
   *  Einzelbewertung ignoriert der Server sie zugunsten von `ids.length`. */
  limit: number;
  unit: string;
  /** Antwort auf „warum wurde nichts bewertet?" bei der Einzelbewertung. */
  notEligibleMsg: string;
  Icon: typeof Newspaper;
  batch: ModeCopy;
  single: ModeCopy;
}

// Warum ein Einzel-Lauf leer ausgehen kann. Die Gates sind bewusst dieselben
// wie im Batch-Pfad (publication_rescore_pool bzw. kommende Events), sonst
// könnte man über die Detailseite Archiviertes bewerten lassen.
const NOT_ELIGIBLE_PUB =
  'Diese Publikation wurde nicht bewertet. Entweder trägt sie bereits einen Score (dann „Bereits Bewertetes neu bewerten" ankreuzen), oder sie ist archiviert, dem ITA zugeordnet, oder ihr Text reicht für eine Bewertung nicht aus.';
const NOT_ELIGIBLE_EVENT =
  'Dieses Event wurde nicht bewertet. Entweder trägt es bereits einen Score (dann „Bereits Bewertetes neu bewerten" ankreuzen), oder es liegt in der Vergangenheit.';

const PUB_LIMIT = 200;
const EVENT_LIMIT = 50;

const ENTITY: Record<ScoringEntity, EntityConfig> = {
  publications: {
    endpoint: '/api/analysis/batch',
    limit: PUB_LIMIT,
    unit: 'Publikationen',
    notEligibleMsg: NOT_ELIGIBLE_PUB,
    Icon: Newspaper,
    batch: {
      title: 'Publikationen bewerten',
      description:
        'Bewertet neu hinzugekommene Publikations-Kandidaten, mit Haiku-Prüfung und Lektorat. Das kostet API-Guthaben; das In-Chat-Scoring bleibt der kostenlose Weg.',
      scopeNote: `Bewertet Publikations-Kandidaten, die in den letzten ${SCORING_RECENT_DAYS} Tagen hinzugekommen sind (höchstens ${PUB_LIMIT} pro Lauf). Ältere Kandidaten laufen bewusst über das In-Chat-Scoring.`,
    },
    single: {
      title: 'Diese Publikation bewerten',
      description:
        'Bewertet genau diese Publikation, mit Haiku-Prüfung und Lektorat. Das kostet API-Guthaben.',
      scopeNote: 'Bewertet nur diesen Eintrag, unabhängig vom Eingangsdatum.',
    },
  },
  events: {
    endpoint: '/api/events/analyze',
    limit: EVENT_LIMIT,
    unit: 'Events',
    notEligibleMsg: NOT_ELIGIBLE_EVENT,
    Icon: CalendarDays,
    batch: {
      title: 'Events bewerten',
      description:
        'Bewertet kommende, noch unbewertete Events, mit Lektorat. Das kostet API-Guthaben; das In-Chat-Scoring bleibt der kostenlose Weg.',
      scopeNote: `Bewertet bis zu ${EVENT_LIMIT} kommende Events pro Lauf.`,
    },
    single: {
      title: 'Dieses Event bewerten',
      description:
        'Bewertet genau dieses Event, mit Lektorat. Das kostet API-Guthaben.',
      scopeNote: 'Bewertet nur diesen Eintrag.',
    },
  },
};

const STEPS: ProgressStepDef[] = [
  { key: 'load', label: 'Kandidaten laden', icon: Database },
  { key: 'score', label: 'Bewerten', icon: Brain },
  { key: 'finish', label: 'Fertigstellen', icon: Sparkles },
];

export function ScoringModal({
  entity,
  open,
  onOpenChange,
  onComplete,
  ids,
}: {
  entity: ScoringEntity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
  /** Einzel-/Auswahl-Bewertung: genau diese Datensätze statt der Kandidatenmenge. */
  ids?: string[];
}) {
  const single = (ids?.length ?? 0) > 0;
  const cfg = ENTITY[entity];
  const copy = single ? cfg.single : cfg.batch;
  const router = useRouter();
  const [phase, setPhase] = useState<ProgressPhase>('idle');
  const [force, setForce] = useState(false);
  const [step, setStep] = useState<Step>(null);
  const [counts, setCounts] = useState<Counts>(ZERO);
  const [currentTitle, setCurrentTitle] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [skippedMsg, setSkippedMsg] = useState<string | null>(null);
  const elapsed = useElapsedSeconds(phase === 'running');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    setPhase('idle');
    setStep(null);
    setCounts(ZERO);
    setCurrentTitle(null);
    setErrorMsg(null);
    setSkippedMsg(null);
  }, []);

  const handleEvent = useCallback(
    (eventType: string, raw: unknown) => {
      // SSE-Payload ist `unknown` (lib/client/sse.ts); ein Frame ist immer ein
      // JSON-Objekt — defensiv auf Record eingrenzen statt blind zu casten.
      const data: Record<string, unknown> =
        typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
      const num = (v: unknown) => Number(v) || 0;
      switch (eventType) {
        case 'init':
          // Kandidaten geladen → Schritt 1 fertig, Schritt 2 an.
          setCounts((c) => ({
            ...c,
            total: num(data.total),
            costCapUsd: data.cost_cap_usd == null ? null : num(data.cost_cap_usd),
          }));
          setStep('score');
          break;
        case 'skipped':
          // Nichts zu tun: ein anderer Lauf hält den Lock (Nacht, Knopf, CLI),
          // oder es gibt keinen Kandidaten. Kommt statt init, ohne complete.
          setSkippedMsg(
            data.reason === 'lock_busy'
              ? String(data.message || 'Es läuft bereits eine Bewertung.')
              : single
                ? cfg.notEligibleMsg
                : `Keine offenen ${cfg.unit} zum Bewerten.`,
          );
          setPhase('skipped');
          break;
        case 'progress':
          setStep('score');
          setCounts((c) => ({
            ...c,
            processed: num(data.processed),
            total: num(data.total),
            tokens: num(data.tokens_used),
            cost: num(data.cost),
          }));
          if (typeof data.current_title === 'string') setCurrentTitle(data.current_title);
          break;
        case 'error':
          setErrorMsg(String(data.message || 'Unbekannter Fehler'));
          if (data.fatal) setPhase('error');
          break;
        case 'complete':
          setStep('finish');
          setCounts((c) => ({
            ...c,
            processed: num(data.processed),
            total: num(data.total),
            successful: num(data.successful),
            failed: num(data.failed),
            tokens: num(data.tokens_used),
            cost: num(data.cost),
            skipped: num(data.skipped),
            haikuRejected: num(data.haiku_rejected),
            lektoratFlags: num(data.lektorat_flags),
            lektoratChanges: num(data.lektorat_changes),
            costCapHit: data.cost_cap_hit === true,
            costCapUsd: data.cost_cap_usd == null ? c.costCapUsd : num(data.cost_cap_usd),
          }));
          setPhase((p) => (p === 'error' ? 'error' : 'done'));
          router.refresh();
          onComplete?.();
          break;
      }
    },
    [router, onComplete, single, cfg],
  );

  const start = useCallback(async () => {
    setPhase('running');
    setStep('load');
    setCounts(ZERO);
    setCurrentTitle(null);
    setErrorMsg(null);
    setSkippedMsg(null);

    const headers = getApiHeaders();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(cfg.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          limit: cfg.limit,
          forceReanalyze: force,
          ...(ids?.length ? { ids } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        // 503 = diese Instanz bewertet nicht (kein Anthropic-Key, Effort ≠ max);
        // der Klartext steht in `error`.
        const err = await res.json().catch(() => ({}));
        setErrorMsg(err.error || err.message || `HTTP ${res.status}`);
        setPhase('error');
        return;
      }

      await consumeSSE(res, handleEvent);
    } catch (err) {
      if (controller.signal.aborted) return;
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : 'Verbindung fehlgeschlagen');
    }
  }, [cfg, force, handleEvent, ids]);

  const onDialogOpenChange = useCallback(
    (o: boolean) => {
      onOpenChange(o);
      if (!o) {
        abortRef.current?.abort();
        reset();
      }
    },
    [onOpenChange, reset],
  );

  const close = useCallback(() => onDialogOpenChange(false), [onDialogOpenChange]);

  const pct = counts.total > 0 ? Math.round((counts.processed / counts.total) * 100) : 0;
  const running = phase === 'running';
  const active = running || phase === 'done';

  return (
    <ProgressDialogShell
      open={open}
      onOpenChange={onDialogOpenChange}
      icon={cfg.Icon}
      title={copy.title}
      description={copy.description}
      onClose={close}
    >
      <PhaseTransition stageKey={active ? 'active' : phase}>
        {phase === 'idle' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-foreground">Modell</p>
              <div className="flex items-center gap-2.5 rounded-[11px] border border-line px-3.5 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{MODEL_LABEL}</span>
                <span className="shrink-0 whitespace-nowrap font-mono text-2xs text-ink-soft">
                  Effort max · Anthropic-API
                </span>
              </div>
              <p className="text-2xs leading-relaxed text-ink-soft">
                {copy.scopeNote} Für jeden Lauf gilt ein Kostendeckel.
              </p>
            </div>

            <ForceCheckbox checked={force} onChange={setForce}>
              Bereits Bewertetes neu bewerten (überschreibt)
            </ForceCheckbox>

            <StartRunButton onClick={start}>Bewerten starten</StartRunButton>
          </div>
        )}

        {active && (
          <div className="space-y-4">
            <PhaseStepper steps={STEPS} current={step} done={phase === 'done'} />

            {(step === 'score' || phase === 'done') && counts.total > 0 && (
              <RunProgressBar
                pct={pct}
                done={phase === 'done'}
                label={
                  <>
                    {phase === 'done' ? counts.successful : counts.processed} / {counts.total} bewertet
                  </>
                }
              >
                {running && currentTitle && (
                  <p className="truncate text-2xs text-ink-soft" title={currentTitle}>
                    {currentTitle}
                  </p>
                )}
              </RunProgressBar>
            )}

            <MetricGrid>
              <Metric label="bewertet" value={counts.successful || (running ? counts.processed : 0)} />
              <Metric label="fehlgeschlagen" value={counts.failed} />
              <Metric
                label={counts.costCapUsd ? `Kosten · Deckel $${counts.costCapUsd}` : 'Kosten'}
                value={counts.cost ? `$${counts.cost.toFixed(4)}` : '–'}
              />
            </MetricGrid>

            <ElapsedLine done={phase === 'done'} elapsed={elapsed} tokens={counts.tokens} />

            {errorMsg && running && <RunWarning>{errorMsg}</RunWarning>}

            {phase === 'done' && (
              <DoneSection onClose={close}>
                <span className="flex flex-col gap-0.5">
                  <span>
                    {counts.successful} {cfg.unit} bewertet
                    {counts.failed > 0 && ` · ${counts.failed} fehlgeschlagen`}
                    {counts.skipped > 0 && ` · ${counts.skipped} übersprungen`}.
                  </span>
                  {qualityLine(counts) && <span className="text-xs font-medium">{qualityLine(counts)}</span>}
                </span>
              </DoneSection>
            )}
            {running && <RunningHint />}
          </div>
        )}

        {phase === 'skipped' && skippedMsg && (
          <SkippedSection msg={skippedMsg}>
            <Button variant="outline" onClick={close} className="w-full rounded-[11px]">
              Schließen
            </Button>
          </SkippedSection>
        )}
        {phase === 'error' && errorMsg && <ErrorSection msg={errorMsg} onClose={close} />}
      </PhaseTransition>
    </ProgressDialogShell>
  );
}
