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
import { getApiHeaders } from '@/lib/settings-store';
import { Play, Square, RotateCcw } from 'lucide-react';
import type {
  EnrichmentSourceName,
  EnrichmentSourceStatus,
} from '@/lib/types';

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
  sources: Record<EnrichmentSourceName, SourceState>;
}

interface CompletedPub {
  title: string;
  finalStatus: 'enriched' | 'partial' | 'failed';
  sourcesUsed: string[];
  hasAbstract: boolean;
}

type ModalStatus = 'idle' | 'running' | 'complete' | 'error';
type CapybaraState = 'idle' | 'working' | 'found' | 'error' | 'complete';

const ALL_SOURCES: EnrichmentSourceName[] = ['crossref', 'openalex', 'unpaywall', 'semantic_scholar', 'pdf'];

const SOURCE_LABELS: Record<EnrichmentSourceName, string> = {
  crossref: 'CrossRef',
  openalex: 'OpenAlex',
  unpaywall: 'Unpaywall',
  semantic_scholar: 'Semantic Scholar',
  pdf: 'PDF Extract',
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
// Capybara SVG
// ---------------------------------------------------------------------------

function CapybaraSvg({ state }: { state: CapybaraState }) {
  const animClass =
    state === 'working'
      ? 'animate-capybara-work'
      : state === 'found'
        ? 'animate-capybara-celebrate'
        : state === 'error'
          ? 'animate-capybara-scratch'
          : state === 'complete'
            ? 'animate-capybara-happy'
            : '';

  return (
    <div className={`relative w-16 h-16 ${animClass}`}>
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        {/* Body */}
        <ellipse cx="32" cy="40" rx="18" ry="14" fill="#8B6914" />
        {/* Head */}
        <ellipse cx="32" cy="24" rx="12" ry="10" fill="#A07B1E" />
        {/* Snout */}
        <ellipse cx="32" cy="28" rx="7" ry="5" fill="#C4A24E" />
        {/* Nose */}
        <ellipse cx="32" cy="26" rx="2.5" ry="1.5" fill="#4A3508" />
        {/* Eyes */}
        <circle cx="26" cy="22" r="2" fill="#1a1a1a" />
        <circle cx="38" cy="22" r="2" fill="#1a1a1a" />
        <circle cx="26.7" cy="21.3" r="0.7" fill="white" />
        <circle cx="38.7" cy="21.3" r="0.7" fill="white" />
        {/* Ears */}
        <ellipse cx="22" cy="16" rx="3" ry="4" fill="#8B6914" />
        <ellipse cx="42" cy="16" rx="3" ry="4" fill="#8B6914" />
        <ellipse cx="22" cy="16" rx="2" ry="3" fill="#C4A24E" />
        <ellipse cx="42" cy="16" rx="2" ry="3" fill="#C4A24E" />
        {/* Legs */}
        <rect x="18" y="48" width="6" height="8" rx="3" fill="#8B6914" />
        <rect x="40" y="48" width="6" height="8" rx="3" fill="#8B6914" />
        {/* Mouth - subtle smile */}
        <path d="M29 30 Q32 32 35 30" stroke="#4A3508" strokeWidth="0.8" fill="none" strokeLinecap="round" />
        {/* Paper/document in front (working state) */}
        {(state === 'working' || state === 'found') && (
          <g className="origin-center">
            <rect x="24" y="36" width="16" height="12" rx="1" fill="white" stroke="#ddd" strokeWidth="0.5" />
            <line x1="27" y1="39" x2="37" y2="39" stroke="#ccc" strokeWidth="0.8" />
            <line x1="27" y1="42" x2="35" y2="42" stroke="#ccc" strokeWidth="0.8" />
            <line x1="27" y1="45" x2="33" y2="45" stroke="#ccc" strokeWidth="0.8" />
          </g>
        )}
        {/* Confetti for complete */}
        {state === 'complete' && (
          <>
            <circle cx="10" cy="10" r="1.5" fill="#ef4444" className="animate-ping" />
            <circle cx="54" cy="8" r="1.5" fill="#3b82f6" className="animate-ping" style={{ animationDelay: '0.2s' }} />
            <circle cx="8" cy="30" r="1.5" fill="#22c55e" className="animate-ping" style={{ animationDelay: '0.4s' }} />
            <circle cx="56" cy="28" r="1.5" fill="#eab308" className="animate-ping" style={{ animationDelay: '0.3s' }} />
            <circle cx="20" cy="6" r="1" fill="#a855f7" className="animate-ping" style={{ animationDelay: '0.5s' }} />
            <circle cx="48" cy="4" r="1" fill="#f97316" className="animate-ping" style={{ animationDelay: '0.1s' }} />
          </>
        )}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Source status icon
// ---------------------------------------------------------------------------

function SourceStatusIcon({ status }: { status: EnrichmentSourceStatus }) {
  switch (status) {
    case 'waiting':
      return <span className="text-neutral-300 text-sm">--</span>;
    case 'loading':
      return <span className="inline-block w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />;
    case 'success':
      return <span className="text-green-600 font-medium text-sm">found</span>;
    case 'no_data':
      return <span className="text-amber-500 text-sm">none</span>;
    case 'error':
      return <span className="text-red-500 text-sm">error</span>;
    case 'skipped':
      return <span className="text-neutral-400 text-sm italic">skipped</span>;
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
      ? 'text-green-700'
      : pub.finalStatus === 'partial'
        ? 'text-amber-600'
        : 'text-red-600';

  return (
    <div className="flex items-start gap-2 py-1.5 text-xs border-b border-neutral-100 last:border-0">
      <span>{icon}</span>
      <span className="truncate flex-1 min-w-0">{pub.title}</span>
      <span className={`shrink-0 font-medium ${statusColor}`}>{pub.finalStatus}</span>
      {pub.sourcesUsed.length > 0 && (
        <span className="shrink-0 text-neutral-400">({pub.sourcesUsed.join(' + ')})</span>
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
  includePartial?: boolean;
  includeNoDoi?: boolean;
  limit?: number;
}

export function EnrichmentModal({
  open,
  onOpenChange,
  onComplete,
  includePartial = false,
  includeNoDoi = false,
  limit = 500,
}: EnrichmentModalProps) {
  const [status, setStatus] = useState<ModalStatus>('idle');
  const [currentPub, setCurrentPub] = useState<PubProgress | null>(null);
  const [completed, setCompleted] = useState<CompletedPub[]>([]);
  const [pubIndex, setPubIndex] = useState(0);
  const [pubTotal, setPubTotal] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [capybaraState, setCapybaraState] = useState<CapybaraState>('idle');
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
    setCapybaraState('idle');
    setSourceCounts({});
    setFinalStats(null);
    setErrorMessage(null);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const startEnrichment = useCallback(async () => {
    reset();
    setStatus('running');
    setCapybaraState('working');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/enrichment/batch', {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ limit, include_partial: includePartial, include_no_doi: includeNoDoi }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json();
        setStatus('error');
        setCapybaraState('error');
        setErrorMessage(err.error || err.message || 'Request failed');
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        setStatus('complete');
        setCapybaraState('complete');
        setErrorMessage(data.message);
        onComplete?.();
        return;
      }

      // SSE stream
      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              handleSSEEvent(eventType, data);
            } catch {
              // ignore malformed
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setStatus('complete');
        setCapybaraState('complete');
        return;
      }
      setStatus('error');
      setCapybaraState('error');
      setErrorMessage(err instanceof Error ? err.message : 'Connection failed');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, includePartial, includeNoDoi, reset]);

  const handleSSEEvent = useCallback((eventType: string, data: Record<string, unknown>) => {
    switch (eventType) {
      case 'pub_start': {
        setPubIndex(data.index as number);
        setPubTotal(data.total as number);
        setCurrentPub({
          title: data.title as string,
          doi: data.doi as string | null,
          sources: emptySourceStates(),
        });
        setCapybaraState('working');
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
          setCapybaraState('found');
          // Reset back to working after a brief moment
          setTimeout(() => setCapybaraState(prev => prev === 'found' ? 'working' : prev), 600);
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
        setCapybaraState('complete');
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

  const pct = pubTotal > 0 ? Math.round(((pubIndex + 1) / pubTotal) * 100) : 0;
  const elapsed = Math.floor(elapsedMs / 1000);
  const rate = elapsed > 0 && completed.length > 0
    ? (completed.length / elapsed).toFixed(1)
    : '0.0';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <CapybaraSvg state={capybaraState} />
            <div className="flex-1 min-w-0">
              <DialogTitle>Publication Enrichment</DialogTitle>
              <DialogDescription>
                {status === 'idle' && 'Query CrossRef, OpenAlex, Unpaywall & Semantic Scholar for metadata.'}
                {status === 'running' && `Processing ${pubIndex + 1} / ${pubTotal} publications...`}
                {status === 'complete' && 'Enrichment complete!'}
                {status === 'error' && 'Enrichment encountered an error.'}
              </DialogDescription>
            </div>
            {status === 'running' && (
              <span className="text-xs text-neutral-400 tabular-nums shrink-0">
                {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
              </span>
            )}
          </div>
        </DialogHeader>

        {/* Progress bar */}
        {status === 'running' && (
          <div className="space-y-1">
            <Progress value={pct} />
            <div className="flex justify-between text-xs text-neutral-500">
              <span>{pubIndex + 1} / {pubTotal}</span>
              <span>{pct}%</span>
            </div>
          </div>
        )}

        {/* Current publication detail card */}
        {status === 'running' && currentPub && (
          <div className="rounded-lg border p-3 space-y-2 bg-neutral-50/50">
            <div className="space-y-0.5">
              <p className="text-sm font-medium truncate">{currentPub.title}</p>
              {currentPub.doi ? (
                <p className="text-xs text-neutral-400 font-mono truncate">DOI: {currentPub.doi}</p>
              ) : (
                <p className="text-xs text-amber-500 italic">No DOI &mdash; PDF only</p>
              )}
            </div>
            <div className="space-y-1.5">
              {ALL_SOURCES.map(src => {
                const s = currentPub.sources[src];
                const isSkipped = s.status === 'skipped';
                return (
                  <div key={src} className={`flex items-center gap-2 text-xs ${isSkipped ? 'opacity-40' : ''}`}>
                    <span className="w-28 text-neutral-600 font-medium">{SOURCE_LABELS[src]}</span>
                    <SourceStatusIcon status={s.status} />
                    {s.status === 'success' && s.found && (
                      <span className="text-neutral-500 truncate flex-1 min-w-0">
                        {s.found.abstract && (
                          <span className="text-green-700">abstract</span>
                        )}
                        {s.found.journal && (
                          <span className="ml-1">{s.found.journal}</span>
                        )}
                        {s.found.keywords && s.found.keywords.length > 0 && (
                          <span className="ml-1 text-neutral-400">
                            [{s.found.keywords.slice(0, 3).join(', ')}]
                          </span>
                        )}
                      </span>
                    )}
                    {s.status === 'error' && s.error && (
                      <span className="text-red-400 truncate">{s.error}</span>
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
            <p className="text-xs font-medium text-neutral-500 mb-1">
              Completed ({completed.length})
            </p>
            <div ref={logRef} className="max-h-[200px] overflow-y-auto rounded border p-2 bg-white">
              {completed.map((pub, i) => (
                <CompletedRow key={i} pub={pub} />
              ))}
            </div>
          </div>
        )}

        {/* Footer stats */}
        {(status === 'running' || status === 'complete') && completed.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500 border-t pt-2">
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
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-2">
            <p className="text-sm font-medium text-green-800">Enrichment Complete</p>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                {finalStats.successful} enriched
              </Badge>
              {finalStats.partial > 0 && (
                <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                  {finalStats.partial} partial
                </Badge>
              )}
              {finalStats.failed > 0 && (
                <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                  {finalStats.failed} failed
                </Badge>
              )}
              <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                {finalStats.withAbstract} with abstract
              </Badge>
            </div>
          </div>
        )}

        {/* Error display */}
        {status === 'error' && errorMessage && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-700">{errorMessage}</p>
          </div>
        )}

        {/* Idle state - nothing to enrich message */}
        {status === 'complete' && !finalStats && errorMessage && (
          <div className="rounded-lg border bg-neutral-50 p-3">
            <p className="text-sm text-neutral-600">{errorMessage}</p>
          </div>
        )}

        <DialogFooter>
          {status === 'idle' && (
            <Button onClick={startEnrichment} size="sm">
              <Play className="mr-2 h-4 w-4" />
              Start Enrichment
            </Button>
          )}
          {status === 'running' && (
            <Button onClick={stop} variant="destructive" size="sm">
              <Square className="mr-2 h-4 w-4" />
              Stop
            </Button>
          )}
          {(status === 'complete' || status === 'error') && (
            <Button onClick={startEnrichment} variant="outline" size="sm">
              <RotateCcw className="mr-2 h-4 w-4" />
              Run Again
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      {/* Capybara animation styles */}
      <style jsx global>{`
        @keyframes capybara-work {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes capybara-celebrate {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-5deg); }
          75% { transform: rotate(5deg); }
        }
        @keyframes capybara-scratch {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          75% { transform: translateX(2px); }
        }
        @keyframes capybara-happy {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        .animate-capybara-work {
          animation: capybara-work 1s ease-in-out infinite;
        }
        .animate-capybara-celebrate {
          animation: capybara-celebrate 0.4s ease-in-out;
        }
        .animate-capybara-scratch {
          animation: capybara-scratch 0.5s ease-in-out infinite;
        }
        .animate-capybara-happy {
          animation: capybara-happy 1.5s ease-in-out infinite;
        }
      `}</style>
    </Dialog>
  );
}
