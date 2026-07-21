'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIsMobile } from '@/lib/client/hooks/use-is-mobile';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { StatusBanner } from '@/components/status-banner';
import { getApiHeaders } from '@/lib/client/stores/settings-store';
import { consumeSSE } from '@/lib/client/sse';
import { LLM_MODELS, formatModelPricing } from '@/lib/shared/constants';
import { useModelPricing } from '@/lib/client/hooks/use-model-pricing';
import { cn } from '@/lib/shared/utils';
import {
  RefreshCw,
  Play,
  AlertCircle,
  Check,
  CheckCircle2,
  Loader2,
  Download,
  Sparkles,
  Tags,
  InstagramLogo,
  X,
} from '@/lib/icons';

type Phase = 'idle' | 'running' | 'done' | 'skipped' | 'error';
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

const STEPS: { key: Exclude<Step, null>; label: string; icon: typeof Download }[] = [
  { key: 'fetch', label: 'Posts laden', icon: Download },
  { key: 'analyze', label: 'Themen analysieren', icon: Tags },
  { key: 'snapshot', label: 'Lagebild erstellen', icon: Sparkles },
];

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * „Aktualisieren" — der APIFY→LLM-Refresh-Flow im Mock-Design: getinteter
 * Kopf mit Instagram-Quadrat, Modell-Liste + Throttle-Checkbox im Idle,
 * animierter 3-Phasen-Stepper mit füllenden Verbindungslinien, Fortschritt,
 * Live-Metrik-Karten und Sekunden-Timer im Lauf. Desktop = zentriertes Modal,
 * Mobile = Bottom-Sheet.
 */
export function RefreshButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [force, setForce] = useState(false);
  const [step, setStep] = useState<Step>(null);
  const [counts, setCounts] = useState<Counts>(ZERO);
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

  // Abort any in-flight refresh if the component unmounts mid-run.
  useEffect(() => () => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    setPhase('idle');
    setStep(null);
    setCounts(ZERO);
    setErrorMsg(null);
    setSkippedMsg(null);
    setElapsed(0);
  }, []);

  const handleEvent = useCallback(
    (eventType: string, data: Record<string, unknown>) => {
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
    setElapsed(0);

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

  const body = (
    <RefreshFlow
      phase={phase}
      step={step}
      counts={counts}
      elapsed={elapsed}
      model={model}
      onModel={setModel}
      force={force}
      onForce={setForce}
      errorMsg={errorMsg}
      skippedMsg={skippedMsg}
      onStart={start}
      onClose={close}
      onForceRetry={() => {
        setForce(true);
        reset();
      }}
    />
  );

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

      {isMobile ? (
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent grabber={false} className="max-h-[92%]">
            <div className="overflow-y-auto pb-[max(env(safe-area-inset-bottom),1rem)]">
              <RefreshHeader onClose={close} className="rounded-t-[22px]" TitleSlot={DrawerTitle} />
              <div className="px-4 pt-4">{body}</div>
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[500px]" showCloseButton={false}>
            <RefreshHeader onClose={close} TitleSlot={DialogTitle} />
            <div className="px-5 pb-5 pt-4">{body}</div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/** Getinteter Kopf (Mock): Instagram-Quadrat, Titel + Beschreibung, X. Von
 *  Dialog und Drawer geteilt; `TitleSlot` liefert das jeweils a11y-korrekte
 *  Title-Primitive (Radix Dialog bzw. vaul). */
function RefreshHeader({
  onClose,
  className,
  TitleSlot,
}: {
  onClose: () => void;
  className?: string;
  TitleSlot: React.ComponentType<{ className?: string; children?: React.ReactNode }>;
}) {
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
        <InstagramLogo className="h-5 w-5" weight="fill" />
      </span>
      <div className="min-w-0 flex-1">
        <TitleSlot className="text-base font-bold tracking-[-0.01em]">
          Social Media aktualisieren
        </TitleSlot>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-subtle">
          Lädt neue Posts der aktiven Kanäle, extrahiert Themen und erstellt ein neues Lagebild.
        </p>
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

/** Innenleben des Refresh-Flows (Dialog + Sheet identisch). */
function RefreshFlow({
  phase,
  step,
  counts,
  elapsed,
  model,
  onModel,
  force,
  onForce,
  errorMsg,
  skippedMsg,
  onStart,
  onClose,
  onForceRetry,
}: {
  phase: Phase;
  step: Step;
  counts: Counts;
  elapsed: number;
  model: string;
  onModel: (m: string) => void;
  force: boolean;
  onForce: (f: boolean) => void;
  errorMsg: string | null;
  skippedMsg: string | null;
  onStart: () => void;
  onClose: () => void;
  onForceRetry: () => void;
}) {
  const reduce = useReducedMotion();
  const curIdx = step ? STEPS.findIndex((s) => s.key === step) : -1;
  const stepState = (i: number): 'done' | 'active' | 'pending' =>
    phase === 'done' ? 'done' : i < curIdx ? 'done' : i === curIdx ? 'active' : 'pending';
  const pct = counts.total > 0 ? Math.round((counts.processed / counts.total) * 100) : 0;
  const running = phase === 'running';
  const active = running || phase === 'done';
  // Live-Preise nur holen, solange der Picker überhaupt sichtbar ist.
  const pricing = useModelPricing(phase === 'idle');

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
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-foreground">Modell</p>
              <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-[11px] border border-line p-1.5">
                {LLM_MODELS.map((m) => {
                  const selected = model === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => onModel(m.value)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2.5 text-left text-sm transition-colors',
                        selected ? 'bg-foreground text-background' : 'hover:bg-muted',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                          selected ? 'border-background' : 'border-line-strong',
                        )}
                        aria-hidden
                      >
                        {selected && <span className="h-[7px] w-[7px] rounded-full bg-background" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{m.label}</span>
                      <span
                        title="Preis je 1 Mio. Tokens: Eingabe / Ausgabe"
                        className={cn(
                          'shrink-0 whitespace-nowrap font-mono text-2xs',
                          selected ? 'text-background/70' : 'text-ink-soft',
                        )}
                      >
                        {formatModelPricing(pricing[m.value] ?? m.fallbackPricing)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

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
              Throttle ignorieren (trotz kürzlicher Aktualisierung)
            </label>

            <motion.div whileTap={reduce ? undefined : { scale: 0.985 }}>
              <Button
                onClick={onStart}
                className="w-full gap-2 rounded-[11px] py-5 text-sm font-semibold shadow-[0_6px_16px_rgba(0,71,187,.28)]"
              >
                <Play className="h-4 w-4" weight="fill" /> Starten
              </Button>
            </motion.div>
          </div>
        )}

        {active && (
          <div className="space-y-4">
            {/* Phase stepper (Mock: Kreise + füllende Verbindungslinien) */}
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

            {/* Analyze progress (Mock: Gradient-Balken) */}
            {(step === 'analyze' || phase === 'done') && counts.total > 0 && (
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
                    {phase === 'done' ? counts.analyzed : counts.processed} / {counts.total} Posts analysiert
                  </span>
                  <span>{phase === 'done' ? 100 : pct}%</span>
                </div>
              </div>
            )}

            {/* Live metrics (Mock: 3 Karten) */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <Metric label="geladen" value={`${counts.fetched}${counts.added ? ` (+${counts.added})` : ''}`} />
              <Metric label="Themen" value={counts.themes || '–'} />
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
                  Aktualisierung abgeschlossen.
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
            <Button onClick={onForceRetry} className="w-full rounded-[11px]">
              Trotzdem aktualisieren
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
