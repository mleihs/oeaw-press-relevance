'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { StatusBanner } from '@/components/status-banner';
import { useIsMobile } from '@/lib/client/hooks/use-is-mobile';
import { getApiHeaders } from '@/lib/client/stores/settings-store';
import { consumeSSE } from '@/lib/client/sse';
import { DEFAULT_LLM_MODEL } from '@/lib/shared/constants';
import { ModelPicker } from '@/components/model-picker';
import { SCORING_RECENT_DAYS } from '@/lib/shared/dashboard';
import { cn } from '@/lib/shared/utils';
import {
  Play,
  AlertCircle,
  Check,
  CheckCircle2,
  Loader2,
  Database,
  Brain,
  Sparkles,
  Newspaper,
  CalendarDays,
  X,
} from '@/lib/icons';

// Gemeinsames „Bewerten"-Fallback-Modal für Publikationen UND Events —
// strukturell der Zwilling von app/social/_components/refresh-button.tsx („aus
// einem Guss"): getinteter Kopf mit Brand-Icon, Modell-Picker + Force-Checkbox im
// Idle, 3-Phasen-Stepper (Kandidaten laden → Bewerten → Fertigstellen) aus den
// SSE-Frames im Lauf, Live-Metriken, Desktop-Dialog / Mobile-Drawer.
//
// Der In-Chat-Pfad (Opus, €0) bleibt der bevorzugte Weg; DIES ist der teurere
// OpenRouter-Fallback für Teammitglieder. Controlled (open/onOpenChange), damit
// Dashboard-Kachel, Publikations- und Events-Seite dieselbe Komponente teilen.

type Entity = 'publications' | 'events';
type Phase = 'idle' | 'running' | 'done' | 'skipped' | 'error';
type Step = 'load' | 'score' | 'finish' | null;

interface Counts {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  tokens: number;
  cost: number;
  /** Ausdrücklich benannte Einträge, die an den Bewertbarkeits-Gates hingen. */
  skipped: number;
}
const ZERO: Counts = {
  total: 0, processed: 0, successful: 0, failed: 0, tokens: 0, cost: 0, skipped: 0,
};

/** Die drei Copy-Zeilen, in denen sich Sammellauf und Einzelbewertung
 *  unterscheiden. Alles andere (Endpunkt, Deckel, Icon, Begründung) hängt an
 *  der Entität, nicht am Modus. */
interface ModeCopy {
  title: string;
  description: string;
  /** Eine Zeile unter dem Modell-Picker: was dieser Lauf konkret erfasst. */
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

const ENTITY: Record<Entity, EntityConfig> = {
  publications: {
    endpoint: '/api/analysis/batch',
    limit: PUB_LIMIT,
    unit: 'Publikationen',
    notEligibleMsg: NOT_ELIGIBLE_PUB,
    Icon: Newspaper,
    batch: {
      title: 'Publikationen bewerten',
      description:
        'Bewertet neu hinzugekommene Publikations-Kandidaten über OpenRouter. Bevorzugt bleibt das kostenlose In-Chat-Scoring; dieser Weg ist der Fallback, wenn es schneller gehen muss.',
      scopeNote: `Bewertet Publikations-Kandidaten, die in den letzten ${SCORING_RECENT_DAYS} Tagen hinzugekommen sind (höchstens ${PUB_LIMIT} pro Lauf). Ältere Kandidaten laufen bewusst über das In-Chat-Scoring.`,
    },
    single: {
      title: 'Diese Publikation bewerten',
      description:
        'Bewertet genau diese Publikation über OpenRouter. Das kostet Guthaben; das kostenlose In-Chat-Scoring bleibt der bevorzugte Weg.',
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
        'Bewertet kommende, noch unbewertete Events über OpenRouter (Fallback zum bevorzugten In-Chat-Scoring).',
      scopeNote: `Bewertet bis zu ${EVENT_LIMIT} kommende Events pro Lauf.`,
    },
    single: {
      title: 'Dieses Event bewerten',
      description:
        'Bewertet genau dieses Event über OpenRouter. Das kostet Guthaben; das kostenlose In-Chat-Scoring bleibt der bevorzugte Weg.',
      scopeNote: 'Bewertet nur diesen Eintrag.',
    },
  },
};

const STEPS: { key: Exclude<Step, null>; label: string; icon: typeof Database }[] = [
  { key: 'load', label: 'Kandidaten laden', icon: Database },
  { key: 'score', label: 'Bewerten', icon: Brain },
  { key: 'finish', label: 'Fertigstellen', icon: Sparkles },
];

const EASE = [0.22, 1, 0.36, 1] as const;

export function ScoringModal({
  entity,
  open,
  onOpenChange,
  onComplete,
  ids,
}: {
  entity: Entity;
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
  const isMobile = useIsMobile();
  const [phase, setPhase] = useState<Phase>('idle');
  const [model, setModel] = useState(DEFAULT_LLM_MODEL);
  const [force, setForce] = useState(false);
  const [step, setStep] = useState<Step>(null);
  const [counts, setCounts] = useState<Counts>(ZERO);
  const [currentTitle, setCurrentTitle] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [skippedMsg, setSkippedMsg] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (phase !== 'running') return;
    startRef.current = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 250);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    setPhase('idle');
    setStep(null);
    setCounts(ZERO);
    setCurrentTitle(null);
    setErrorMsg(null);
    setSkippedMsg(null);
    setElapsed(0);
  }, []);

  const handleEvent = useCallback(
    (eventType: string, data: Record<string, unknown>) => {
      const num = (v: unknown) => Number(v) || 0;
      switch (eventType) {
        case 'init':
          // Kandidaten geladen + Budget geprüft → Schritt 1 fertig, Schritt 2 an.
          setCounts((c) => ({ ...c, total: num(data.total) }));
          setStep('score');
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
          }));
          setPhase((p) => (p === 'error' ? 'error' : 'done'));
          router.refresh();
          onComplete?.();
          break;
      }
    },
    [router, onComplete],
  );

  const start = useCallback(async () => {
    setPhase('running');
    setStep('load');
    setCounts(ZERO);
    setCurrentTitle(null);
    setErrorMsg(null);
    setSkippedMsg(null);
    setElapsed(0);

    const headers = getApiHeaders();
    headers['x-llm-model'] = model;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(cfg.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          limit: cfg.limit,
          batchSize: 3,
          forceReanalyze: force,
          ...(ids?.length ? { ids } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // 409 = ein Lauf ist bereits aktiv (run-lock) → kein Fehler, „skipped".
        if (res.status === 409) {
          setSkippedMsg(err.error || 'Es läuft bereits eine Bewertung.');
          setPhase('skipped');
          return;
        }
        setErrorMsg(err.error || err.message || `HTTP ${res.status}`);
        setPhase('error');
        return;
      }

      // Leere Kandidatenmenge → Route antwortet Plain-JSON (kein Stream).
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('event-stream')) {
        await res.json().catch(() => ({}));
        setSkippedMsg(
          single
            ? cfg.notEligibleMsg
            : `Keine offenen ${cfg.unit} zum Bewerten.`,
        );
        setPhase('skipped');
        return;
      }

      await consumeSSE(res, handleEvent);
    } catch (err) {
      if (controller.signal.aborted) return;
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : 'Verbindung fehlgeschlagen');
    }
  }, [cfg, model, force, handleEvent, ids, single]);

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

  const body = (
    <ScoringFlow
      cfg={cfg}
      copy={copy}
      phase={phase}
      step={step}
      counts={counts}
      currentTitle={currentTitle}
      elapsed={elapsed}
      model={model}
      onModel={setModel}
      force={force}
      onForce={setForce}
      errorMsg={errorMsg}
      skippedMsg={skippedMsg}
      onStart={start}
      onClose={close}
    />
  );

  return isMobile ? (
    <Drawer open={open} onOpenChange={onDialogOpenChange}>
      <DrawerContent grabber={false} className="max-h-[92%]">
        <div className="overflow-y-auto pb-[max(env(safe-area-inset-bottom),1rem)]">
          <ScoringHeader cfg={cfg} copy={copy} onClose={close} className="rounded-t-[22px]" TitleSlot={DrawerTitle} />
          <div className="px-4 pt-4">{body}</div>
        </div>
      </DrawerContent>
    </Drawer>
  ) : (
    <Dialog open={open} onOpenChange={onDialogOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[500px]" showCloseButton={false}>
        <ScoringHeader cfg={cfg} copy={copy} onClose={close} TitleSlot={DialogTitle} />
        <div className="px-5 pb-5 pt-4">{body}</div>
      </DialogContent>
    </Dialog>
  );
}

function ScoringHeader({
  cfg,
  copy,
  onClose,
  className,
  TitleSlot,
}: {
  cfg: EntityConfig;
  copy: ModeCopy;
  onClose: () => void;
  className?: string;
  TitleSlot: React.ComponentType<{ className?: string; children?: React.ReactNode }>;
}) {
  const Icon = cfg.Icon;
  return (
    <div
      className={cn(
        'flex items-start gap-3 border-b border-line/70 bg-gradient-to-br from-brand-50 to-surface-muted px-5 py-4 dark:from-brand-500/10 dark:to-transparent',
        className,
      )}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-brand-500 text-white shadow-[0_4px_12px_rgba(0,71,187,.32)]"
        aria-hidden
      >
        <Icon className="h-5 w-5" weight="fill" />
      </span>
      <div className="min-w-0 flex-1">
        <TitleSlot className="text-base font-bold tracking-[-0.01em]">{copy.title}</TitleSlot>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-subtle">{copy.description}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Schließen"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-surface/70 text-ink-subtle transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function ScoringFlow({
  cfg,
  copy,
  phase,
  step,
  counts,
  currentTitle,
  elapsed,
  model,
  onModel,
  force,
  onForce,
  errorMsg,
  skippedMsg,
  onStart,
  onClose,
}: {
  cfg: EntityConfig;
  copy: ModeCopy;
  phase: Phase;
  step: Step;
  counts: Counts;
  currentTitle: string | null;
  elapsed: number;
  model: string;
  onModel: (m: string) => void;
  force: boolean;
  onForce: (f: boolean) => void;
  errorMsg: string | null;
  skippedMsg: string | null;
  onStart: () => void;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const curIdx = step ? STEPS.findIndex((s) => s.key === step) : -1;
  const stepState = (i: number): 'done' | 'active' | 'pending' =>
    phase === 'done' ? 'done' : i < curIdx ? 'done' : i === curIdx ? 'active' : 'pending';
  const pct = counts.total > 0 ? Math.round((counts.processed / counts.total) * 100) : 0;
  const running = phase === 'running';
  const active = running || phase === 'done';

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={active ? 'active' : phase}
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? undefined : { opacity: 0, y: -6 }}
        transition={{ duration: 0.22, ease: EASE }}
      >
        {phase === 'idle' && (
          <div className="space-y-4">
            <ModelPicker
              value={model}
              onChange={onModel}
              enabled={phase === 'idle'}
              note={`${copy.scopeNote} In-Chat-Scoring (Opus, kostenlos) bleibt der bevorzugte Weg.`}
            />

            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-strong">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => onForce(e.target.checked)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 transition-colors',
                  'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2',
                  force ? 'border-brand-500 bg-brand-500' : 'border-line-strong bg-surface',
                )}
                aria-hidden
              >
                <Check className={cn('h-3 w-3 text-white', force ? 'opacity-100' : 'opacity-0')} weight="bold" />
              </span>
              Bereits Bewertetes neu bewerten (überschreibt)
            </label>

            <motion.div whileTap={reduce ? undefined : { scale: 0.985 }}>
              <Button
                onClick={onStart}
                className="w-full gap-2 rounded-[11px] py-5 text-sm font-semibold shadow-[0_6px_16px_rgba(0,71,187,.28)]"
              >
                <Play className="h-4 w-4" weight="fill" /> Bewerten starten
              </Button>
            </motion.div>
          </div>
        )}

        {active && (
          <div className="space-y-4">
            <ol className="flex items-start">
              {STEPS.map((s, i) => {
                const st = stepState(i);
                const Icon = s.icon;
                return (
                  <li key={s.key} className="flex flex-1 items-start last:flex-none">
                    <div className="flex w-16 flex-col items-center gap-1.5 text-center">
                      <motion.div
                        animate={reduce ? undefined : { scale: st === 'active' ? 1.08 : 1 }}
                        transition={{
                          duration: 0.3,
                          repeat: st === 'active' ? Infinity : 0,
                          repeatType: 'reverse',
                        }}
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors duration-300',
                          st === 'done' && 'border-brand bg-brand text-white',
                          st === 'active' && 'border-brand bg-surface text-brand',
                          st === 'pending' && 'border-line text-ink-soft/60',
                        )}
                      >
                        {st === 'done' ? (
                          <Check className="h-4 w-4" weight="bold" />
                        ) : st === 'active' ? (
                          <Loader2 className="h-4 w-4 animate-spin" weight="bold" />
                        ) : (
                          <Icon className="h-4 w-4" weight="bold" />
                        )}
                      </motion.div>
                      <span
                        className={cn(
                          'text-2xs leading-tight',
                          st === 'pending' ? 'text-ink-soft' : 'font-medium text-foreground',
                        )}
                      >
                        {s.label}
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className="mt-[19px] h-0.5 flex-1 overflow-hidden rounded bg-fill">
                        <div
                          className={cn(
                            'h-full rounded bg-brand transition-all duration-500',
                            i < curIdx || phase === 'done' ? 'w-full' : 'w-0',
                          )}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>

            {(step === 'score' || phase === 'done') && counts.total > 0 && (
              <div className="space-y-1.5">
                <div className="h-2 overflow-hidden rounded-full bg-fill">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-[width] duration-300"
                    style={{ width: `${phase === 'done' ? 100 : pct}%` }}
                    role="progressbar"
                    aria-valuenow={phase === 'done' ? 100 : pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
                <div className="flex justify-between font-mono text-2xs text-ink-subtle">
                  <span>
                    {phase === 'done' ? counts.successful : counts.processed} / {counts.total} bewertet
                  </span>
                  <span>{phase === 'done' ? 100 : pct}%</span>
                </div>
                {running && currentTitle && (
                  <p className="truncate text-2xs text-ink-soft" title={currentTitle}>
                    {currentTitle}
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-center">
              <Metric label="bewertet" value={counts.successful || (running ? counts.processed : 0)} />
              <Metric label="fehlgeschlagen" value={counts.failed} />
              <Metric label="Kosten" value={counts.cost ? `$${counts.cost.toFixed(4)}` : '–'} />
            </div>

            <p className="text-center font-mono text-2xs text-ink-soft">
              {phase === 'done' ? 'Fertig' : 'Läuft'} · {elapsed}s
              {counts.tokens > 0 && ` · ${counts.tokens.toLocaleString('de-AT')} Tokens`}
            </p>

            {errorMsg && running && (
              <StatusBanner variant="warning" icon={<AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />}>
                {errorMsg}
              </StatusBanner>
            )}

            {phase === 'done' && (
              <motion.div
                initial={reduce ? false : { opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="space-y-3"
              >
                <div className="flex items-center gap-2.5 rounded-[11px] border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-[18px] w-[18px] shrink-0" weight="fill" />
                  {counts.successful} {cfg.unit} bewertet
                  {counts.failed > 0 && ` · ${counts.failed} fehlgeschlagen`}
                  {counts.skipped > 0 && ` · ${counts.skipped} übersprungen`}.
                </div>
                <Button variant="outline" onClick={onClose} className="w-full rounded-[11px]">
                  Schließen
                </Button>
              </motion.div>
            )}
            {running && (
              <div className="flex items-center justify-center gap-2 text-sm font-semibold text-ink-soft">
                <Loader2 className="h-4 w-4 animate-spin" weight="bold" /> Läuft …
              </div>
            )}
          </div>
        )}

        {phase === 'skipped' && skippedMsg && (
          <div className="space-y-3">
            <StatusBanner variant="neutral" className="px-3 py-3 text-sm">
              {skippedMsg}
            </StatusBanner>
            <Button variant="outline" onClick={onClose} className="w-full rounded-[11px]">
              Schließen
            </Button>
          </div>
        )}
        {phase === 'error' && errorMsg && (
          <div className="space-y-3">
            <StatusBanner
              variant="error"
              icon={<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              className="space-y-1 px-3 py-3 text-sm"
            >
              <p className="font-medium">Fehler</p>
              <p>{errorMsg}</p>
            </StatusBanner>
            <Button variant="outline" onClick={onClose} className="w-full rounded-[11px]">
              Schließen
            </Button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[10px] border border-line/70 bg-surface-muted px-2 py-2">
      <div className="font-mono text-[15px] font-semibold tabular-nums text-foreground">{value}</div>
      <div className="mt-0.5 text-2xs text-ink-soft">{label}</div>
    </div>
  );
}
