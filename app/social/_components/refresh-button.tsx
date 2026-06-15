'use client';

import { useCallback, useRef, useState } from 'react';
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
import { RefreshCw, Play, AlertCircle, Check, Loader2 } from 'lucide-react';

type Phase = 'idle' | 'running' | 'done' | 'skipped' | 'error';

interface CompleteData {
  skipped: boolean;
  fetched: number;
  new: number;
  analyzed: number;
  themes: number | null;
  total_cost: number;
  apify_cost: number;
  llm_cost: number;
}

const DEFAULT_MODEL = 'deepseek/deepseek-chat';

export function RefreshButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [force, setForce] = useState(false);
  const [statusLine, setStatusLine] = useState('');
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [complete, setComplete] = useState<CompleteData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [skippedMsg, setSkippedMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setPhase('idle');
    setStatusLine('');
    setProgress({ processed: 0, total: 0 });
    setComplete(null);
    setErrorMsg(null);
    setSkippedMsg(null);
  }, []);

  const handleEvent = useCallback(
    (type: string, data: Record<string, unknown>) => {
      switch (type) {
        case 'fetching':
          setStatusLine('Lade Posts von Instagram (Apify) …');
          break;
        case 'fetched':
          setStatusLine(`${data.fetched ?? 0} Posts geladen (${data.new ?? 0} neu). Analysiere …`);
          break;
        case 'analyzing':
          setProgress({ processed: 0, total: Number(data.total) || 0 });
          break;
        case 'progress':
          setProgress({
            processed: Number(data.processed) || 0,
            total: Number(data.total) || 0,
          });
          break;
        case 'snapshot':
          setStatusLine(`Lagebild erstellt (${data.themes ?? 0} Themen).`);
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
          const c = data as unknown as CompleteData;
          setComplete(c);
          setPhase((p) => (p === 'error' ? 'error' : c.skipped ? 'skipped' : 'done'));
          // Pull the freshly stored posts/snapshot into the RSC page.
          if (!c.skipped) router.refresh();
          break;
        }
      }
    },
    [router],
  );

  const start = useCallback(async () => {
    setPhase('running');
    setStatusLine('Initialisiere …');
    setProgress({ processed: 0, total: 0 });
    setComplete(null);
    setErrorMsg(null);
    setSkippedMsg(null);

    const controller = new AbortController();
    abortRef.current = controller;
    const headers = getApiHeaders();
    headers['x-llm-model'] = model;

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
      if ((err as Error).name === 'AbortError') {
        reset();
        return;
      }
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : 'Verbindung fehlgeschlagen');
    }
  }, [model, force, reset, handleEvent]);

  const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o && phase !== 'running') reset();
      }}
    >
      <Button
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
        title={disabled ? 'APIFY_TOKEN nicht konfiguriert' : undefined}
      >
        <RefreshCw className="mr-2 h-4 w-4" />
        Aktualisieren
      </Button>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Social Media aktualisieren</DialogTitle>
          <DialogDescription>
            Lädt die neuesten Posts der aktiven Kanäle, extrahiert Themen und
            erstellt ein neues Lagebild.
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
                      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        selected ? 'bg-foreground text-background' : 'hover:bg-muted'
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                          selected ? 'border-background' : 'border-input'
                        }`}
                      >
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
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
                className="rounded border-input"
              />
              <span>Throttle ignorieren (trotz kürzlicher Aktualisierung)</span>
            </label>
          </div>
        )}

        {phase === 'running' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {statusLine}
            </div>
            {progress.total > 0 && (
              <div className="space-y-1">
                <Progress value={pct} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{progress.processed} / {progress.total} Posts analysiert</span>
                  <span>{pct}%</span>
                </div>
              </div>
            )}
            {errorMsg && (
              <StatusBanner variant="warning" icon={<AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />}>
                {errorMsg}
              </StatusBanner>
            )}
          </div>
        )}

        {phase === 'done' && complete && (
          <StatusBanner variant="success" className="space-y-1 px-3 py-3 text-sm">
            <p className="font-medium">Aktualisierung abgeschlossen</p>
            <p>
              {complete.fetched} Posts geladen ({complete.new} neu),{' '}
              {complete.analyzed} analysiert
              {complete.themes != null && <>, {complete.themes} Themen</>}.
            </p>
            <p className="text-xs text-muted-foreground">
              Kosten dieses Laufs ≈ ${complete.total_cost.toFixed(4)} (Apify ≈ $
              {complete.apify_cost.toFixed(4)} · LLM ${complete.llm_cost.toFixed(4)})
            </p>
          </StatusBanner>
        )}

        {phase === 'skipped' && skippedMsg && (
          <StatusBanner variant="neutral" className="px-3 py-3 text-sm">
            {skippedMsg}
          </StatusBanner>
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
              <Play className="mr-2 h-4 w-4" />
              Starten
            </Button>
          )}
          {phase === 'running' && (
            <Button size="sm" variant="outline" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Läuft …
            </Button>
          )}
          {(phase === 'done' || phase === 'error') && (
            <Button size="sm" variant="outline" onClick={reset}>
              Schließen
            </Button>
          )}
          {phase === 'skipped' && (
            <Button
              size="sm"
              onClick={() => {
                setForce(true);
                setPhase('idle');
              }}
            >
              Trotzdem aktualisieren
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
