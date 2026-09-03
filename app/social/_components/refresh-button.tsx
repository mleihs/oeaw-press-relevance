'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiHeaders } from '@/lib/client/stores/settings-store';
import { consumeSSE } from '@/lib/client/sse';
import { ModelPicker } from '@/components/model-picker';
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
import { RefreshCw, Download, Sparkles, Tags, InstagramLogo } from '@/lib/icons';

type Step = 'fetch' | 'analyze' | 'snapshot' | null;

interface Counts {
  fetched: number;
  added: number;
  analyzed: number;
  total: number;
  processed: number;
  themes: number;
  tokens: number;
  cost: number;
}

const ZERO: Counts = { fetched: 0, added: 0, analyzed: 0, total: 0, processed: 0, themes: 0, tokens: 0, cost: 0 };
const DEFAULT_MODEL = 'deepseek/deepseek-chat';

const STEPS: ProgressStepDef[] = [
  { key: 'fetch', label: 'Posts laden', icon: Download },
  { key: 'analyze', label: 'Themen analysieren', icon: Tags },
  { key: 'snapshot', label: 'Lagebild erstellen', icon: Sparkles },
];

/**
 * „Aktualisieren" — der APIFY→LLM-Refresh-Flow im Mock-Design: getinteter
 * Kopf mit Instagram-Quadrat, Modell-Liste + Throttle-Checkbox im Idle,
 * animierter 3-Phasen-Stepper mit füllenden Verbindungslinien, Fortschritt,
 * Live-Metrik-Karten und Sekunden-Timer im Lauf. Desktop = zentriertes Modal,
 * Mobile = Bottom-Sheet. Die geteilte Optik/Struktur (Zwilling von
 * components/scoring-modal.tsx) lebt in components/progress-dialog-shell.tsx;
 * hier bleiben Domänen-Copy und die Interpretation der SSE-Frames.
 */
export function RefreshButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<ProgressPhase>('idle');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [force, setForce] = useState(false);
  const [step, setStep] = useState<Step>(null);
  const [counts, setCounts] = useState<Counts>(ZERO);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [skippedMsg, setSkippedMsg] = useState<string | null>(null);
  const elapsed = useElapsedSeconds(phase === 'running');
  const abortRef = useRef<AbortController | null>(null);

  // Abort any in-flight refresh if the component unmounts mid-run.
  useEffect(() => () => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    setPhase('idle');
    setStep(null);
    setCounts(ZERO);
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
        case 'fetching':
          setStep('fetch');
          break;
        case 'fetched':
          setCounts((c) => ({ ...c, fetched: num(data.fetched), added: num(data.new) }));
          setStep('analyze');
          break;
        case 'analyzing':
          setCounts((c) => ({ ...c, total: num(data.total) }));
          setStep('analyze');
          break;
        case 'progress':
          setCounts((c) => ({ ...c, processed: num(data.processed), total: num(data.total) }));
          break;
        case 'snapshot':
          setStep('snapshot');
          setCounts((c) => ({ ...c, themes: num(data.themes) }));
          break;
        case 'skipped':
          setSkippedMsg(
            `Übersprungen: letzte Aktualisierung vor ${data.minutes_ago} Min. (Limit: ${data.threshold_minutes} Min.). Mit „Trotzdem aktualisieren" erzwingen.`,
          );
          break;
        case 'error':
          setErrorMsg(String(data.message || 'Unbekannter Fehler'));
          if (data.fatal) setPhase('error');
          break;
        case 'complete': {
          const skipped = Boolean(data.skipped);
          setCounts((c) => ({
            ...c,
            fetched: num(data.fetched),
            added: num(data.new),
            analyzed: num(data.analyzed),
            themes: data.themes == null ? c.themes : num(data.themes),
            tokens: num(data.tokens),
            cost: num(data.total_cost),
          }));
          setPhase((p) => (p === 'error' ? 'error' : skipped ? 'skipped' : 'done'));
          if (!skipped) router.refresh();
          break;
        }
      }
    },
    [router],
  );

  const start = useCallback(async () => {
    setPhase('running');
    setStep(null);
    setCounts(ZERO);
    setErrorMsg(null);
    setSkippedMsg(null);

    const headers = getApiHeaders();
    headers['x-llm-model'] = model;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/social/refresh', {
        method: 'POST',
        headers,
        body: JSON.stringify({ force }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPhase('error');
        setErrorMsg(err.error || err.message || `HTTP ${res.status}`);
        return;
      }
      await consumeSSE(res, handleEvent);
    } catch (err) {
      // Intentional abort (dialog closed / unmounted) — not an error to show.
      if (controller.signal.aborted) return;
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : 'Verbindung fehlgeschlagen');
    }
  }, [model, force, handleEvent]);

  // Closing aborts an in-flight run (the server honors request-abort and skips
  // the snapshot) and clears state, so no setState/router.refresh fires against
  // a closed dialog/sheet.
  const onOpenChange = useCallback(
    (o: boolean) => {
      setOpen(o);
      if (!o) {
        abortRef.current?.abort();
        reset();
      }
    },
    [reset],
  );

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const pct = counts.total > 0 ? Math.round((counts.processed / counts.total) * 100) : 0;
  const running = phase === 'running';
  const active = running || phase === 'done';

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title={disabled ? 'APIFY_TOKEN nicht konfiguriert' : undefined}
      >
        <RefreshCw className="mr-2 h-4 w-4" />
        Aktualisieren
      </Button>

      <ProgressDialogShell
        open={open}
        onOpenChange={onOpenChange}
        icon={InstagramLogo}
        title="Social Media aktualisieren"
        description="Lädt neue Posts der aktiven Kanäle, extrahiert Themen und erstellt ein neues Lagebild."
        onClose={close}
      >
        <PhaseTransition stageKey={active ? 'active' : phase}>
          {phase === 'idle' && (
            <div className="space-y-4">
              <ModelPicker value={model} onChange={setModel} enabled={phase === 'idle'} />

              <ForceCheckbox checked={force} onChange={setForce}>
                Throttle ignorieren (trotz kürzlicher Aktualisierung)
              </ForceCheckbox>

              <StartRunButton onClick={start}>Starten</StartRunButton>
            </div>
          )}

          {active && (
            <div className="space-y-4">
              {/* Phase stepper (Mock: Kreise + füllende Verbindungslinien) */}
              <PhaseStepper steps={STEPS} current={step} done={phase === 'done'} />

              {/* Analyze progress (Mock: Gradient-Balken) */}
              {(step === 'analyze' || phase === 'done') && counts.total > 0 && (
                <RunProgressBar
                  pct={pct}
                  done={phase === 'done'}
                  label={
                    <>
                      {phase === 'done' ? counts.analyzed : counts.processed} / {counts.total} Posts analysiert
                    </>
                  }
                />
              )}

              {/* Live metrics (Mock: 3 Karten) */}
              <MetricGrid>
                <Metric label="geladen" value={`${counts.fetched}${counts.added ? ` (+${counts.added})` : ''}`} />
                <Metric label="Themen" value={counts.themes || '–'} />
                <Metric label="Kosten" value={counts.cost ? `$${counts.cost.toFixed(4)}` : '–'} />
              </MetricGrid>

              <ElapsedLine done={phase === 'done'} elapsed={elapsed} tokens={counts.tokens} />

              {errorMsg && running && <RunWarning>{errorMsg}</RunWarning>}

              {phase === 'done' && (
                <DoneSection onClose={close}>Aktualisierung abgeschlossen.</DoneSection>
              )}
              {running && <RunningHint />}
            </div>
          )}

          {phase === 'skipped' && skippedMsg && (
            <SkippedSection msg={skippedMsg}>
              <Button
                onClick={() => {
                  setForce(true);
                  reset();
                }}
                className="w-full rounded-[11px]"
              >
                Trotzdem aktualisieren
              </Button>
            </SkippedSection>
          )}
          {phase === 'error' && errorMsg && <ErrorSection msg={errorMsg} onClose={close} />}
        </PhaseTransition>
      </ProgressDialogShell>
    </>
  );
}
