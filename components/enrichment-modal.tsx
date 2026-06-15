'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { TintBadge } from '@/components/tint-badge';
import { CapybaraModalAvatar, type CapybaraAvatarState } from '@/components/capybara-modal-avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getApiHeaders } from '@/lib/client/stores/settings-store';
import { consumeSSE } from '@/lib/client/sse';
import { Play, Square, RotateCcw } from 'lucide-react';
import type {
  EnrichmentSourceName,
  EnrichmentSourceStatus,
  ModalStatus,
} from '@/lib/shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SourceState {
  status: EnrichmentSourceStatus;
  found?: {
    abstract?: string;
    journal?: string;
    keywords?: string[];
  };
  error?: string;
}

interface PubProgress {
  title: string;
  doi: string | null;
  hasCsvAbstract: boolean;
  sources: Record<EnrichmentSourceName, SourceState>;
}

interface CompletedPub {
  title: string;
  finalStatus: 'enriched' | 'partial' | 'failed';
  sourcesUsed: string[];
  hasAbstract: boolean;
}

interface EnrichmentConfig {
  limit: number;
  includePartial: boolean;
  includeNoDoi: boolean;
}

const ALL_SOURCES: EnrichmentSourceName[] = ['crossref', 'openalex', 'unpaywall', 'semantic_scholar', 'pdf'];

const SOURCE_LABELS: Record<string, string> = {
  crossref: 'CrossRef',
  openalex: 'OpenAlex',
  unpaywall: 'Unpaywall',
  semantic_scholar: 'Semantic Scholar',
  pdf: 'PDF Extract',
  csv: 'CSV Abstract',
  webdb_summary: 'WebDB',
};

function emptySourceStates(): Record<EnrichmentSourceName, SourceState> {
  return {
    crossref: { status: 'waiting' },
    openalex: { status: 'waiting' },
    unpaywall: { status: 'waiting' },
    semantic_scholar: { status: 'waiting' },
    pdf: { status: 'waiting' },
  };
}

// ---------------------------------------------------------------------------
// Source status icon
// ---------------------------------------------------------------------------

function SourceStatusIcon({ status }: { status: EnrichmentSourceStatus }) {
  switch (status) {
    case 'waiting':
      return <span className="text-muted-foreground/50 text-sm">--</span>;
    case 'loading':
      return <span className="inline-block w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />;
    case 'success':
      return <span className="text-green-600 font-medium text-sm">gefunden</span>;
    case 'no_data':
      return <span className="text-amber-500 text-sm">nichts</span>;
    case 'error':
      return <span className="text-red-500 text-sm">Fehler</span>;
    case 'skipped':
      return <span className="text-muted-foreground/70 text-sm italic">übersprungen</span>;
  }
}

// ---------------------------------------------------------------------------
// Completed publication row
// ---------------------------------------------------------------------------

function CompletedRow({ pub }: { pub: CompletedPub }) {
  const icon =
    pub.finalStatus === 'enriched'
      ? '\u2705'
      : pub.finalStatus === 'partial'
        ? '\u26A0\uFE0F'
        : '\u274C';

  const statusColor =
    pub.finalStatus === 'enriched'
      ? 'text-green-700 dark:text-green-300'
      : pub.finalStatus === 'partial'
        ? 'text-amber-800 dark:text-amber-300'
        : 'text-red-600 dark:text-red-400';

  return (
    <div className="flex items-start gap-2 py-1.5 text-xs border-b border-border/60 last:border-0">
      <span>{icon}</span>
      <span className="truncate flex-1 min-w-0">{pub.title}</span>
      <span className={`shrink-0 font-medium ${statusColor}`}>{pub.finalStatus}</span>
      {pub.sourcesUsed.length > 0 && (
        <span className="shrink-0 text-muted-foreground/70">({pub.sourcesUsed.join(' + ')})</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Modal
// ---------------------------------------------------------------------------

interface EnrichmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export function EnrichmentModal({
  open,
  onOpenChange,
  onComplete,
}: EnrichmentModalProps) {
  const [status, setStatus] = useState<ModalStatus>('idle');
  const [config, setConfig] = useState<EnrichmentConfig>({
    limit: 500,
    includePartial: false,
    includeNoDoi: false,
  });
  const [currentPub, setCurrentPub] = useState<PubProgress | null>(null);
  const [completed, setCompleted] = useState<CompletedPub[]>([]);
  const [pubIndex, setPubIndex] = useState(0);
  const [pubTotal, setPubTotal] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [capybaraState, setCapybaraAvatarState] = useState<CapybaraAvatarState>('idle');
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({});
  const [finalStats, setFinalStats] = useState<{
    successful: number;
    partial: number;
    failed: number;
    withAbstract: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll completed log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [completed]);

  // Elapsed timer
  useEffect(() => {
    if (status === 'running') {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 500);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status]);

  const reset = useCallback(() => {
    setStatus('idle');
    setCurrentPub(null);
    setCompleted([]);
    setPubIndex(0);
    setPubTotal(0);
    setElapsedMs(0);
    setCapybaraAvatarState('idle');
    setSourceCounts({});
    setFinalStats(null);
    setErrorMessage(null);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleSSEEvent = useCallback((eventType: string, data: Record<string, unknown>) => {
    switch (eventType) {
      case 'pub_start': {
        setPubIndex(data.index as number);
        setPubTotal(data.total as number);
        setCurrentPub({
          title: data.title as string,
          doi: data.doi as string | null,
          hasCsvAbstract: data.has_csv_abstract === true,
          sources: emptySourceStates(),
        });
        setCapybaraAvatarState('working');
        break;
      }
      case 'source_try': {
        const src = data.source as EnrichmentSourceName;
        setCurrentPub(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            sources: { ...prev.sources, [src]: { status: 'loading' as const } },
          };
        });
        break;
      }
      case 'source_done': {
        const src = data.source as EnrichmentSourceName;
        const srcStatus = data.status as EnrichmentSourceStatus;
        setCurrentPub(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            sources: {
              ...prev.sources,
              [src]: {
                status: srcStatus,
                found: data.found as SourceState['found'],
                error: data.error as string | undefined,
              },
            },
          };
        });
        if (srcStatus === 'success') {
          setCapybaraAvatarState('found');
          // Reset back to working after a brief moment
          setTimeout(() => setCapybaraAvatarState(prev => prev === 'found' ? 'working' : prev), 600);
        }
        break;
      }
      case 'pub_done': {
        const completedPub: CompletedPub = {
          title: data.title as string,
          finalStatus: data.final_status as CompletedPub['finalStatus'],
          sourcesUsed: data.sources_used as string[],
          hasAbstract: data.has_abstract as boolean,
        };
        setCompleted(prev => [...prev, completedPub]);
        if (data.sources_used) {
          const sources = data.sources_used as string[];
          setSourceCounts(prev => {
            const next = { ...prev };
            for (const s of sources) {
              next[s] = (next[s] || 0) + 1;
            }
            return next;
          });
        }
        break;
      }
      case 'complete': {
        setStatus('complete');
        setCapybaraAvatarState('complete');
        setCurrentPub(null);
        setFinalStats({
          successful: data.successful as number,
          partial: data.partial as number,
          failed: data.failed as number,
          withAbstract: data.with_abstract as number,
        });
        setSourceCounts(data.sources as Record<string, number>);
        onComplete?.();
        break;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEnrichment = useCallback(async () => {
    setStatus('running');
    setCurrentPub(null);
    setCompleted([]);
    setPubIndex(0);
    setPubTotal(0);
    setElapsedMs(0);
    setCapybaraAvatarState('working');
    setSourceCounts({});
    setFinalStats(null);
    setErrorMessage(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/enrichment/batch', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({
          limit: config.limit,
          include_partial: config.includePartial,
          include_no_doi: config.includeNoDoi,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json();
        setStatus('error');
        setCapybaraAvatarState('error');
        setErrorMessage(err.error || err.message || 'Request failed');
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        setStatus('complete');
        setCapybaraAvatarState('complete');
        setErrorMessage(data.message);
        onComplete?.();
        return;
      }

      // SSE stream
      await consumeSSE(response, handleSSEEvent);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setStatus('cancelled');
        setCapybaraAvatarState('cancelled');
        setCurrentPub(null);
        return;
      }
      setStatus('error');
      setCapybaraAvatarState('error');
      setErrorMessage(err instanceof Error ? err.message : 'Connection failed');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, reset]);

  const pct = pubTotal > 0 ? Math.round(((pubIndex + 1) / pubTotal) * 100) : 0;
  const elapsed = Math.floor(elapsedMs / 1000);
  const rateNum = elapsed > 0 && completed.length > 0 ? completed.length / elapsed : 0;
  const rate = rateNum.toFixed(1);
  const remaining = pubTotal > 0 && rateNum > 0 ? Math.ceil((pubTotal - completed.length) / rateNum) : 0;
  const etaText = remaining > 60
    ? `~${Math.ceil(remaining / 60)} Min.`
    : remaining > 0
      ? `~${remaining} Sek.`
      : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <CapybaraModalAvatar variant="enricher" state={capybaraState} />
            <div className="flex-1 min-w-0">
              <DialogTitle>Publikationen anreichern</DialogTitle>
              <DialogDescription>
                {status === 'idle' && 'Metadaten von CrossRef, OpenAlex, Unpaywall & Semantic Scholar abrufen.'}
                {status === 'running' && `Verarbeite ${pubIndex + 1} / ${pubTotal} Publikationen...`}
                {status === 'complete' && 'Enrichment abgeschlossen!'}
                {status === 'cancelled' && `Enrichment abgebrochen: ${completed.length} von ${pubTotal} Publikationen verarbeitet.`}
                {status === 'error' && 'Fehler beim Enrichment.'}
              </DialogDescription>
            </div>
            {status === 'running' && (
              <div className="text-right shrink-0">
                <span className="text-xs text-muted-foreground/70 tabular-nums block">
                  {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
                </span>
                {etaText && (
                  <span className="text-[10px] text-muted-foreground/70 block">
                    Restzeit: {etaText}
                  </span>
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        {/* Configuration (idle state) */}
        {status === 'idle' && (
          <div className="space-y-4">
            {/* Sources info */}
            <div className="rounded-lg border bg-muted/50 p-3">
              <p className="text-sm text-foreground/80">
                Quellen: CrossRef, OpenAlex, Unpaywall, Semantic Scholar, PDF Extract
              </p>
            </div>

            {/* Limit */}
            <div className="space-y-1.5">
              <Label htmlFor="enrich-limit" className="text-sm">
                Publikationen zum Enrichen
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  id="enrich-limit"
                  type="number"
                  min={1}
                  max={500}
                  value={config.limit}
                  onChange={(e) => setConfig(c => ({ ...c, limit: Math.min(500, Math.max(1, parseInt(e.target.value) || 1)) }))}
                  className="w-24"
                />
                <input
                  type="range"
                  min={1}
                  max={500}
                  value={config.limit}
                  onChange={(e) => setConfig(c => ({ ...c, limit: parseInt(e.target.value) }))}
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground/70">
                Die {config.limit} neuesten Publikationen (nach Veröffentlichungsdatum) werden enriched, die noch keine Metadaten haben.
              </p>
            </div>

            {/* Checkboxes */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.includePartial}
                  onChange={(e) => setConfig(c => ({ ...c, includePartial: e.target.checked }))}
                  className="rounded border-input"
                />
                <span>Teilweise erneut verarbeiten</span>
                <span className="text-muted-foreground/70 text-xs">(partial-Status nochmals enrichen)</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.includeNoDoi}
                  onChange={(e) => setConfig(c => ({ ...c, includeNoDoi: e.target.checked }))}
                  className="rounded border-input"
                />
                <span>Ohne DOI einschließen</span>
                <span className="text-muted-foreground/70 text-xs">(Publikationen ohne DOI via PDF enrichen)</span>
              </label>
            </div>
          </div>
        )}

        {/* Progress bar */}
        {status === 'running' && (
          <div className="space-y-1">
            <Progress value={pct} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{pubIndex + 1} / {pubTotal}</span>
              <span>{pct}%</span>
            </div>
          </div>
        )}

        {/* Current publication detail card */}
        {status === 'running' && currentPub && (
          <div className="rounded-lg border p-3 space-y-2 bg-muted/50">
            <div className="space-y-0.5">
              <p className="text-sm font-medium truncate">{currentPub.title}</p>
              <div className="flex items-center gap-2">
                {currentPub.doi ? (
                  <p className="text-xs text-muted-foreground/70 font-mono truncate">DOI: {currentPub.doi}</p>
                ) : (
                  <p className="text-xs text-amber-500 italic">Kein DOI</p>
                )}
                {currentPub.hasCsvAbstract && (
                  <span className="inline-flex items-center rounded bg-blue-100 dark:bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                    CSV abstract
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              {ALL_SOURCES.map(src => {
                const s = currentPub.sources[src];
                const isSkipped = s.status === 'skipped';
                return (
                  <div key={src} className={`flex items-center gap-2 text-xs ${isSkipped ? 'opacity-40' : ''}`}>
                    <span className="w-28 text-foreground/80 font-medium">{SOURCE_LABELS[src]}</span>
                    <SourceStatusIcon status={s.status} />
                    {s.status === 'success' && s.found && (
                      <span className="text-muted-foreground truncate flex-1 min-w-0">
                        {s.found.abstract && (
                          <span className="text-green-700 dark:text-green-300">abstract</span>
                        )}
                        {s.found.journal && (
                          <span className="ml-1">{s.found.journal}</span>
                        )}
                        {s.found.keywords && s.found.keywords.length > 0 && (
                          <span className="ml-1 text-muted-foreground/70">
                            [{s.found.keywords.slice(0, 3).join(', ')}]
                          </span>
                        )}
                      </span>
                    )}
                    {s.status === 'error' && s.error && (
                      <span className="text-red-400 dark:text-red-300/70 truncate">{s.error}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Completed publications log */}
        {completed.length > 0 && (
          <div className="flex-1 min-h-0">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Abgeschlossen ({completed.length})
            </p>
            <div ref={logRef} className="max-h-[200px] overflow-y-auto rounded border p-2 bg-card">
              {completed.map((pub, i) => (
                <CompletedRow key={i} pub={pub} />
              ))}
            </div>
          </div>
        )}

        {/* Footer stats */}
        {(status === 'running' || status === 'complete' || status === 'cancelled') && completed.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground border-t pt-2">
            {Object.entries(sourceCounts).map(([src, count]) => (
              <span key={src}>
                {SOURCE_LABELS[src as EnrichmentSourceName] || src}: <strong>{count}</strong>
              </span>
            ))}
            {status === 'running' && (
              <span className="ml-auto">{rate} pub/sec</span>
            )}
          </div>
        )}

        {/* Final summary on complete */}
        {status === 'complete' && finalStats && (
          <div className="rounded-lg border border-green-200 dark:border-green-500/30 bg-green-50 dark:bg-green-500/[0.08] p-3 space-y-2">
            <p className="text-sm font-medium text-green-800 dark:text-green-200">Enrichment abgeschlossen</p>
            <div className="flex flex-wrap gap-2">
              <TintBadge color="green">
                {finalStats.successful} angereichert
              </TintBadge>
              {finalStats.partial > 0 && (
                <TintBadge color="amber">
                  {finalStats.partial} teilweise
                </TintBadge>
              )}
              {finalStats.failed > 0 && (
                <TintBadge color="red">
                  {finalStats.failed} fehlgeschlagen
                </TintBadge>
              )}
              <TintBadge color="blue">
                {finalStats.withAbstract} mit Abstract
              </TintBadge>
            </div>
          </div>
        )}

        {/* Cancelled summary */}
        {status === 'cancelled' && (
          <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
            <p className="text-sm font-medium text-foreground">Enrichment abgebrochen</p>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-muted text-muted-foreground hover:bg-muted">
                {completed.length} / {pubTotal} verarbeitet
              </Badge>
              {completed.filter(p => p.finalStatus === 'enriched').length > 0 && (
                <TintBadge color="green">
                  {completed.filter(p => p.finalStatus === 'enriched').length} angereichert
                </TintBadge>
              )}
              {completed.filter(p => p.finalStatus === 'partial').length > 0 && (
                <TintBadge color="amber">
                  {completed.filter(p => p.finalStatus === 'partial').length} teilweise
                </TintBadge>
              )}
              {completed.filter(p => p.finalStatus === 'failed').length > 0 && (
                <TintBadge color="red">
                  {completed.filter(p => p.finalStatus === 'failed').length} fehlgeschlagen
                </TintBadge>
              )}
            </div>
          </div>
        )}

        {/* Error display */}
        {status === 'error' && errorMessage && (
          <div className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/[0.08] p-3">
            <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
          </div>
        )}

        {/* Idle state - nothing to enrich message */}
        {status === 'complete' && !finalStats && errorMessage && (
          <div className="rounded-lg border bg-muted/50 p-3">
            <p className="text-sm text-foreground/80">{errorMessage}</p>
          </div>
        )}

        <DialogFooter>
          {status === 'idle' && (
            <Button onClick={startEnrichment} size="sm">
              <Play className="mr-2 h-4 w-4" />
              Enrichment starten
            </Button>
          )}
          {status === 'running' && (
            <Button onClick={stop} variant="destructive" size="sm">
              <Square className="mr-2 h-4 w-4" />
              Stop
            </Button>
          )}
          {(status === 'complete' || status === 'cancelled' || status === 'error') && (
            <Button onClick={reset} variant="outline" size="sm">
              <RotateCcw className="mr-2 h-4 w-4" />
              Erneut starten
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
