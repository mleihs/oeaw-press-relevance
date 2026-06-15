'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { StatusBanner } from '@/components/status-banner';
import { getApiHeaders } from '@/lib/client/stores/settings-store';
import { consumeSSE } from '@/lib/client/sse';
import { LLM_MODELS } from '@/lib/shared/constants';
import { cn } from '@/lib/shared/utils';
import { RefreshCw, Play, AlertCircle, Check, Loader2, Download, Sparkles, Tags } from 'lucide-react';

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

export function RefreshButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const reduce = useReducedMotion();
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

  const curIdx = step ? STEPS.findIndex((s) => s.key === step) : -1;
  const stepState = (i: number): 'done' | 'active' | 'pending' =>
    phase === 'done' ? 'done' : i < curIdx ? 'done' : i === curIdx ? 'active' : 'pending';
  const pct = counts.total > 0 ? Math.round((counts.processed / counts.total) * 100) : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        // Closing aborts an in-flight run (the server honors request-abort and
        // skips the snapshot) and clears state, so no setState/router.refresh
        // fires against a closed dialog.
        if (!o) {
          abortRef.current?.abort();
          reset();
        }
      }}
    >
      <Button size="sm" disabled={disabled} onClick={() => setOpen(true)} title={disabled ? 'APIFY_TOKEN nicht konfiguriert' : undefined}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Aktualisieren
      </Button>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Social Media aktualisieren</DialogTitle>
          <DialogDescription>
            Lädt die neuesten Posts der aktiven Kanäle, extrahiert Themen und erstellt ein neues Lagebild.
          </DialogDescription>
        </DialogHeader>

        {phase === 'idle' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Modell</label>
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border p-1.5">
                {LLM_MODELS.map((m) => {
                  const selected = model === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setModel(m.value)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                        selected ? 'bg-foreground text-background' : 'hover:bg-muted',
                      )}
                    >
                      <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2', selected ? 'border-background' : 'border-input')}>
                        {selected && <Check className="h-2.5 w-2.5" />}
                      </span>
                      <span className="flex-1 font-medium">{m.label}</span>
                      <span className={selected ? 'text-background/70' : 'text-muted-foreground/70'}>
                        {m.costPerMillionTokens === 0 ? 'gratis' : `$${m.costPerMillionTokens}/M`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="rounded border-input" />
              <span>Throttle ignorieren (trotz kürzlicher Aktualisierung)</span>
            </label>
          </div>
        )}

        {(phase === 'running' || phase === 'done') && (
          <div className="space-y-4">
            {/* Phase stepper */}
            <ol className="flex items-center">
              {STEPS.map((s, i) => {
                const st = stepState(i);
                const Icon = s.icon;
                return (
                  <li key={s.key} className="flex flex-1 items-center last:flex-none">
                    <div className="flex flex-col items-center gap-1.5 text-center">
                      <motion.div
                        animate={reduce ? undefined : { scale: st === 'active' ? 1.08 : 1 }}
                        transition={{ duration: 0.3, repeat: st === 'active' ? Infinity : 0, repeatType: 'reverse' }}
                        className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-full border-2',
                          st === 'done' && 'border-brand bg-brand text-white',
                          st === 'active' && 'border-brand text-brand',
                          st === 'pending' && 'border-input text-muted-foreground/50',
                        )}
                      >
                        {st === 'done' ? <Check className="h-4 w-4" /> : st === 'active' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                      </motion.div>
                      <span className={cn('text-[11px] leading-tight', st === 'pending' ? 'text-muted-foreground/60' : 'text-foreground')}>
                        {s.label}
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className="mx-1 h-0.5 flex-1 rounded bg-border">
                        <div className={cn('h-full rounded bg-brand transition-all duration-500', i < curIdx || phase === 'done' ? 'w-full' : 'w-0')} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>

            {/* Analyze progress */}
            {(step === 'analyze' || phase === 'done') && counts.total > 0 && (
              <div className="space-y-1">
                <Progress value={phase === 'done' ? 100 : pct} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{phase === 'done' ? counts.analyzed : counts.processed} / {counts.total} Posts analysiert</span>
                  <span>{phase === 'done' ? 100 : pct}%</span>
                </div>
              </div>
            )}

            {/* Live metrics */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <Metric label="geladen" value={`${counts.fetched}${counts.added ? ` (+${counts.added})` : ''}`} />
              <Metric label="Themen" value={counts.themes || '–'} />
              <Metric label="Kosten" value={counts.cost ? `$${counts.cost.toFixed(4)}` : '–'} />
            </div>

            <p className="text-center text-xs text-muted-foreground tabular-nums">
              {phase === 'done' ? 'Fertig' : 'Läuft'} · {elapsed}s
              {counts.tokens > 0 && ` · ${counts.tokens.toLocaleString('de-AT')} Tokens`}
            </p>

            {errorMsg && phase === 'running' && (
              <StatusBanner variant="warning" icon={<AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />}>
                {errorMsg}
              </StatusBanner>
            )}
            {phase === 'done' && (
              <StatusBanner variant="success" className="text-sm">
                Aktualisierung abgeschlossen.
              </StatusBanner>
            )}
          </div>
        )}

        {phase === 'skipped' && skippedMsg && (
          <StatusBanner variant="neutral" className="px-3 py-3 text-sm">{skippedMsg}</StatusBanner>
        )}
        {phase === 'error' && errorMsg && (
          <StatusBanner variant="error" icon={<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />} className="space-y-1 px-3 py-3 text-sm">
            <p className="font-medium">Fehler</p>
            <p>{errorMsg}</p>
          </StatusBanner>
        )}

        <DialogFooter>
          {phase === 'idle' && (
            <Button size="sm" onClick={start}>
              <Play className="mr-2 h-4 w-4" /> Starten
            </Button>
          )}
          {phase === 'running' && (
            <Button size="sm" variant="outline" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Läuft …
            </Button>
          )}
          {(phase === 'done' || phase === 'error') && (
            <Button size="sm" variant="outline" onClick={reset}>Schließen</Button>
          )}
          {phase === 'skipped' && (
            <Button size="sm" onClick={() => { setForce(true); reset(); }}>Trotzdem aktualisieren</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-2 py-1.5">
      <div className="text-sm font-semibold tabular-nums text-foreground">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
