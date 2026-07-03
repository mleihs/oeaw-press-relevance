'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { Brain, Play, AlertCircle, Check, Loader2 } from '@/lib/icons';

type Phase = 'idle' | 'running' | 'done' | 'error';
const DEFAULT_MODEL = 'deepseek/deepseek-chat';

interface Counts {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  tokens: number;
  cost: number;
}
const ZERO: Counts = { total: 0, processed: 0, successful: 0, failed: 0, tokens: 0, cost: 0 };

export function EventAnalyzeModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [force, setForce] = useState(false);
  const [counts, setCounts] = useState<Counts>(ZERO);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    setPhase('idle');
    setCounts(ZERO);
    setErrorMsg(null);
    setInfoMsg(null);
  }, []);

  const handleEvent = useCallback(
    (type: string, data: Record<string, unknown>) => {
      const num = (v: unknown) => Number(v) || 0;
      switch (type) {
        case 'init':
          setCounts((c) => ({ ...c, total: num(data.total) }));
          break;
        case 'progress':
          setCounts((c) => ({
            ...c,
            processed: num(data.processed),
            total: num(data.total),
            tokens: num(data.tokens_used),
            cost: num(data.cost),
          }));
          break;
        case 'error':
          setErrorMsg(String(data.message || 'Unbekannter Fehler'));
          if (data.fatal) setPhase('error');
          break;
        case 'complete':
          setCounts((c) => ({
            ...c,
            processed: num(data.processed),
            total: num(data.total),
            successful: num(data.successful),
            failed: num(data.failed),
            tokens: num(data.tokens_used),
            cost: num(data.cost),
          }));
          setPhase((p) => (p === 'error' ? 'error' : 'done'));
          router.refresh();
          break;
      }
    },
    [router],
  );

  const start = useCallback(async () => {
    setPhase('running');
    setCounts(ZERO);
    setErrorMsg(null);
    setInfoMsg(null);

    const headers = getApiHeaders();
    headers['x-llm-model'] = model;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/events/analyze', {
        method: 'POST',
        headers,
        // deepseek is slow (~tens of seconds per batch), and the route caps at
        // 300s; keep a run to a chunk that finishes cleanly. Re-run (or use
        // `npm run analyze-events`) to continue — each click scores the next
        // pending chunk, the empty response says when nothing is left.
        body: JSON.stringify({ forceReanalyze: force, limit: 30, batchSize: 3 }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPhase('error');
        setErrorMsg(err.error || err.message || `HTTP ${res.status}`);
        return;
      }
      // The route returns plain JSON (not SSE) when there's nothing to analyze.
      if (!res.headers.get('content-type')?.includes('text/event-stream')) {
        const j = await res.json().catch(() => ({}));
        setInfoMsg(j.message || 'Keine Veranstaltungen zu analysieren.');
        setPhase('done');
        return;
      }
      await consumeSSE(res, handleEvent);
    } catch (err) {
      if (controller.signal.aborted) return;
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : 'Verbindung fehlgeschlagen');
    }
  }, [model, force, handleEvent]);

  const pct = counts.total > 0 ? Math.round((counts.processed / counts.total) * 100) : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          abortRef.current?.abort();
          reset();
        }
      }}
    >
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Brain className="mr-2 h-4 w-4" />
        Analysieren
      </Button>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Veranstaltungen analysieren</DialogTitle>
          <DialogDescription>
            Bewertet kommende Veranstaltungen per Sprachmodell nach Relevanz für die
            Veranstaltungsseite und erzeugt einen Pitch-Vorschlag. Bereits bewertete
            werden übersprungen.
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
              <span>Bereits bewertete Veranstaltungen neu analysieren</span>
            </label>
          </div>
        )}

        {(phase === 'running' || phase === 'done') && !infoMsg && (
          <div className="space-y-3">
            <Progress value={phase === 'done' ? 100 : pct} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{phase === 'done' ? counts.successful : counts.processed} / {counts.total} analysiert</span>
              <span>{phase === 'done' ? 100 : pct}%</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <Metric label="analysiert" value={counts.successful || counts.processed} />
              <Metric label="fehlgeschlagen" value={counts.failed} />
              <Metric label="Kosten" value={counts.cost ? `$${counts.cost.toFixed(4)}` : '–'} />
            </div>
            {errorMsg && phase === 'running' && (
              <StatusBanner variant="warning" icon={<AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />}>
                {errorMsg}
              </StatusBanner>
            )}
            {phase === 'done' && (
              <StatusBanner variant="success" className="text-sm">
                Analyse abgeschlossen: {counts.successful} bewertet
                {counts.failed > 0 ? `, ${counts.failed} fehlgeschlagen` : ''}.
              </StatusBanner>
            )}
          </div>
        )}

        {infoMsg && (
          <StatusBanner variant="neutral" className="px-3 py-3 text-sm">{infoMsg}</StatusBanner>
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
