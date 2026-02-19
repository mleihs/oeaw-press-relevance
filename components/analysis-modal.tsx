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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getApiHeaders, loadSettings } from '@/lib/settings-store';
import { LLM_MODELS } from '@/lib/constants';
import { Play, Square, RotateCcw, AlertCircle, Info, Check } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ModalStatus = 'idle' | 'running' | 'complete' | 'cancelled' | 'error';

interface AnalysisConfig {
  limit: number;
  enrichedOnly: boolean;
  includePartial: boolean;
  forceReanalyze: boolean;
  minWordCount: number;
  model: string;
}

interface ProgressData {
  processed: number;
  total: number;
  currentTitle: string;
  batchIndex: number;
  totalBatches: number;
  tokensUsed: number;
  cost: number;
}

interface CompleteData {
  processed: number;
  total: number;
  successful: number;
  failed: number;
  tokensUsed: number;
  cost: number;
}

// ---------------------------------------------------------------------------
// Tier badge colors
// ---------------------------------------------------------------------------

const TIER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  recommended: { bg: 'bg-green-100', text: 'text-green-700', label: 'Empfohlen' },
  budget: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Budget' },
  balanced: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Ausgewogen' },
  premium: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Premium' },
  free: { bg: 'bg-neutral-100', text: 'text-neutral-600', label: 'Gratis' },
};

// ---------------------------------------------------------------------------
// Capybara SVG (analyst version — with glasses)
// ---------------------------------------------------------------------------

function CapybaraAnalyst({ state }: { state: ModalStatus }) {
  const animClass =
    state === 'running'
      ? 'animate-capybara-work'
      : state === 'complete'
        ? 'animate-capybara-happy'
        : state === 'error'
          ? 'animate-capybara-scratch'
          : state === 'cancelled'
            ? 'animate-capybara-shrug'
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
        {/* Glasses */}
        <circle cx="26" cy="22" r="4" stroke="#4A3508" strokeWidth="0.8" fill="none" />
        <circle cx="38" cy="22" r="4" stroke="#4A3508" strokeWidth="0.8" fill="none" />
        <line x1="30" y1="22" x2="34" y2="22" stroke="#4A3508" strokeWidth="0.8" />
        {/* Ears */}
        <ellipse cx="22" cy="16" rx="3" ry="4" fill="#8B6914" />
        <ellipse cx="42" cy="16" rx="3" ry="4" fill="#8B6914" />
        <ellipse cx="22" cy="16" rx="2" ry="3" fill="#C4A24E" />
        <ellipse cx="42" cy="16" rx="2" ry="3" fill="#C4A24E" />
        {/* Legs */}
        <rect x="18" y="48" width="6" height="8" rx="3" fill="#8B6914" />
        <rect x="40" y="48" width="6" height="8" rx="3" fill="#8B6914" />
        {/* Mouth */}
        <path d="M29 30 Q32 32 35 30" stroke="#4A3508" strokeWidth="0.8" fill="none" strokeLinecap="round" />
        {/* Clipboard (working) */}
        {state === 'running' && (
          <g>
            <rect x="22" y="35" width="20" height="16" rx="1.5" fill="white" stroke="#ccc" strokeWidth="0.5" />
            <rect x="28" y="33" width="8" height="4" rx="1" fill="#4A3508" />
            <line x1="25" y1="40" x2="39" y2="40" stroke="#10b981" strokeWidth="1" />
            <line x1="25" y1="43" x2="36" y2="43" stroke="#10b981" strokeWidth="1" opacity="0.5" />
            <line x1="25" y1="46" x2="33" y2="46" stroke="#10b981" strokeWidth="1" opacity="0.3" />
          </g>
        )}
        {/* Confetti for complete */}
        {state === 'complete' && (
          <>
            <circle cx="10" cy="10" r="1.5" fill="#ef4444" className="animate-ping" />
            <circle cx="54" cy="8" r="1.5" fill="#3b82f6" className="animate-ping" style={{ animationDelay: '0.2s' }} />
            <circle cx="8" cy="30" r="1.5" fill="#22c55e" className="animate-ping" style={{ animationDelay: '0.4s' }} />
            <circle cx="56" cy="28" r="1.5" fill="#eab308" className="animate-ping" style={{ animationDelay: '0.3s' }} />
          </>
        )}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Info tooltip
// ---------------------------------------------------------------------------

function InfoBubble({ text }: { text: string }) {
  const [show, setShow] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="text-neutral-400 hover:text-neutral-600 transition-colors"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(s => !s)}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 rounded-md border bg-white px-2.5 py-1.5 text-xs text-neutral-600 shadow-lg z-50">
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-white" />
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Modal
// ---------------------------------------------------------------------------

interface AnalysisModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export function AnalysisModal({ open, onOpenChange, onComplete }: AnalysisModalProps) {
  const settings = loadSettings();

  const [status, setStatus] = useState<ModalStatus>('idle');
  const [config, setConfig] = useState<AnalysisConfig>({
    limit: 20,
    enrichedOnly: true,
    includePartial: false,
    forceReanalyze: false,
    minWordCount: settings.minWordCount || 100,
    model: settings.llmModel || 'deepseek/deepseek-chat',
  });
  const [progress, setProgress] = useState<ProgressData>({
    processed: 0,
    total: 0,
    currentTitle: '',
    batchIndex: 0,
    totalBatches: 0,
    tokensUsed: 0,
    cost: 0,
  });
  const [completeData, setCompleteData] = useState<CompleteData | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [apiKeyHint, setApiKeyHint] = useState<string | null>(null);
  const [keyBalance, setKeyBalance] = useState<{ limitRemaining: number | null; usage: number; limit: number | null; accountBalance: number | null; effectiveBudget: number | null } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    setProgress({ processed: 0, total: 0, currentTitle: '', batchIndex: 0, totalBatches: 0, tokensUsed: 0, cost: 0 });
    setCompleteData(null);
    setErrors([]);
    setErrorMessage(null);
    setElapsedMs(0);
    setKeyBalance(null);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const startAnalysis = useCallback(async () => {
    setStatus('running');
    setProgress({ processed: 0, total: 0, currentTitle: '', batchIndex: 0, totalBatches: 0, tokensUsed: 0, cost: 0 });
    setCompleteData(null);
    setErrors([]);
    setErrorMessage(null);
    setElapsedMs(0);

    const controller = new AbortController();
    abortRef.current = controller;

    // Override model header with the one selected in modal
    const headers = getApiHeaders();
    headers['x-llm-model'] = config.model;

    try {
      const response = await fetch('/api/analysis/batch', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          limit: config.limit,
          batchSize: settings.batchSize,
          minWordCount: config.minWordCount,
          forceReanalyze: config.forceReanalyze,
          enrichedOnly: config.enrichedOnly,
          includePartial: config.includePartial,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json();
        setStatus('error');
        setErrorMessage(err.error || err.message || 'Request failed');
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        setStatus('complete');
        setCompleteData({ processed: 0, total: 0, successful: 0, failed: 0, tokensUsed: 0, cost: 0 });
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

              if (eventType === 'init') {
                setApiKeyHint(data.api_key_hint ?? null);
                if (data.key_balance) setKeyBalance(data.key_balance);
              } else if (eventType === 'progress') {
                setProgress({
                  processed: data.processed ?? 0,
                  total: data.total ?? 0,
                  currentTitle: data.current_title ?? '',
                  batchIndex: data.batch_index ?? 0,
                  totalBatches: data.total_batches ?? 0,
                  tokensUsed: data.tokens_used ?? 0,
                  cost: data.cost ?? 0,
                });
              } else if (eventType === 'complete') {
                setStatus('complete');
                setCompleteData({
                  processed: data.processed ?? data.total,
                  total: data.total,
                  successful: data.successful,
                  failed: data.failed,
                  tokensUsed: data.tokens_used ?? 0,
                  cost: data.cost ?? 0,
                });
                onComplete?.();
              } else if (eventType === 'error') {
                const rawMsg = data.message || 'Unknown error';
                console.error('[Analysis Modal] SSE error event:', rawMsg);
                // Show the actual error message — only override for specific known codes
                let friendlyMsg = rawMsg;
                if (/\b402\b/.test(rawMsg) && /credits|afford|max_tokens|Budget|Guthaben/i.test(rawMsg)) {
                  friendlyMsg = 'OpenRouter-Guthaben aufgebraucht. Bitte Credits aufladen auf openrouter.ai/settings/credits.';
                } else if (/\b401\b/.test(rawMsg) && /unauthorized|invalid.{0,10}key/i.test(rawMsg)) {
                  friendlyMsg = 'OpenRouter API-Key ungültig. Bitte in den Einstellungen prüfen.';
                }
                setErrors(prev => [...prev, friendlyMsg]);
                // Stop UI on fatal errors
                if (data.fatal) {
                  setStatus('error');
                  setErrorMessage(friendlyMsg);
                }
              }
            } catch {
              // ignore malformed
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setStatus('cancelled');
        return;
      }
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Connection failed');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, settings.batchSize, reset]);

  const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
  const elapsed = Math.floor(elapsedMs / 1000);
  const analysisRate = elapsed > 0 && progress.processed > 0 ? progress.processed / elapsed : 0;
  const analysisRemaining = progress.total > 0 && analysisRate > 0 ? Math.ceil((progress.total - progress.processed) / analysisRate) : 0;
  const analysisEta = analysisRemaining > 60
    ? `~${Math.ceil(analysisRemaining / 60)} Min.`
    : analysisRemaining > 0
      ? `~${analysisRemaining} Sek.`
      : '';

  // Cost estimate based on selected model
  const selectedModel = LLM_MODELS.find(m => m.value === config.model);
  const costRate = selectedModel?.costPerMillionTokens ?? 1;
  // Rough estimate: ~600 tokens per publication (prompt + response)
  const estimatedCost = (config.limit * 600 * costRate) / 1_000_000;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <CapybaraAnalyst state={status} />
            <div className="flex-1 min-w-0">
              <DialogTitle>StoryScout Analyse</DialogTitle>
              <DialogDescription>
                {status === 'idle' && 'Publikationen per LLM auf Story-Potenzial bewerten.'}
                {status === 'running' && `Analysiere ${progress.processed} / ${progress.total} Publikationen...`}
                {status === 'complete' && 'Analyse abgeschlossen!'}
                {status === 'cancelled' && `Analyse abgebrochen — ${progress.processed} von ${progress.total} Publikationen analysiert.`}
                {status === 'error' && 'Fehler bei der Analyse.'}
              </DialogDescription>
            </div>
            {status === 'running' && (
              <div className="text-right shrink-0">
                <span className="text-xs text-neutral-400 tabular-nums block">
                  {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
                </span>
                {analysisEta && (
                  <span className="text-[10px] text-neutral-400 block">
                    Restzeit: {analysisEta}
                  </span>
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        {/* Configuration (idle state) */}
        {status === 'idle' && (
          <div className="space-y-4">
            {/* Model selection */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label className="text-sm">Modell</Label>
                <InfoBubble text="Das LLM-Modell bewertet jede Publikation auf 5 Dimensionen und erstellt einen deutschen Pitch-Vorschlag. Teurere Modelle liefern differenziertere Bewertungen." />
              </div>
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto rounded-lg border p-1.5">
                {LLM_MODELS.map(m => {
                  const isSelected = config.model === m.value;
                  const tier = TIER_STYLES[m.tier];
                  const costFor100 = (100 * 800 * m.costPerMillionTokens) / 1_000_000;

                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setConfig(c => ({ ...c, model: m.value }))}
                      className={`w-full text-left rounded-md px-3 py-2 transition-colors ${
                        isSelected
                          ? 'bg-neutral-900 text-white'
                          : 'hover:bg-neutral-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? 'border-white' : 'border-neutral-300'
                        }`}>
                          {isSelected && <Check className="h-2.5 w-2.5" />}
                        </span>
                        <span className="font-medium text-sm flex-1">{m.label}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          isSelected ? 'bg-white/20 text-white' : `${tier.bg} ${tier.text}`
                        }`}>
                          {tier.label}
                        </span>
                        <span className={`text-xs font-mono tabular-nums ${
                          isSelected ? 'text-white/70' : 'text-neutral-400'
                        }`}>
                          {m.costPerMillionTokens === 0
                            ? 'gratis'
                            : `$${m.costPerMillionTokens}/M`}
                        </span>
                      </div>
                      <p className={`text-xs mt-0.5 pl-6 ${
                        isSelected ? 'text-white/60' : 'text-neutral-400'
                      }`}>
                        {m.description}
                      </p>
                      {costFor100 > 0 && (
                        <p className={`text-[10px] mt-0.5 pl-6 ${
                          isSelected ? 'text-white/40' : 'text-neutral-300'
                        }`}>
                          ~${costFor100.toFixed(4)} pro 100 Publikationen
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Cost estimate + key balance */}
            <div className="rounded-lg border bg-neutral-50/50 p-3 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">Geschätzte Kosten</span>
                <span className="font-mono text-xs">
                  {estimatedCost === 0
                    ? 'Gratis'
                    : `~$${estimatedCost.toFixed(4)} für ${config.limit} Pubs`}
                </span>
              </div>
              {keyBalance && keyBalance.effectiveBudget !== null && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-400">Budget verbleibend</span>
                  <span className={`font-mono ${keyBalance.effectiveBudget < 0.50 ? 'text-red-500 font-medium' : 'text-neutral-500'}`}>
                    ${keyBalance.effectiveBudget.toFixed(4)}
                  </span>
                </div>
              )}
              {keyBalance && keyBalance.effectiveBudget !== null && keyBalance.effectiveBudget < 0.50 && keyBalance.effectiveBudget >= 0.01 && (
                <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span>Niedriges Guthaben — bald Credits aufladen auf openrouter.ai/settings/credits</span>
                </div>
              )}
            </div>

            {/* Limit */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="analysis-limit" className="text-sm">
                  Publikationen analysieren
                </Label>
                <InfoBubble text="Anzahl der Publikationen, die in diesem Durchgang analysiert werden sollen. Sortiert nach Erstellungsdatum (neueste zuerst)." />
              </div>
              <div className="flex items-center gap-3">
                <Input
                  id="analysis-limit"
                  type="number"
                  min={1}
                  max={1000}
                  value={config.limit}
                  onChange={(e) => setConfig(c => ({ ...c, limit: Math.min(1000, Math.max(1, parseInt(e.target.value) || 1)) }))}
                  className="w-24"
                />
                <input
                  type="range"
                  min={1}
                  max={1000}
                  value={config.limit}
                  onChange={(e) => setConfig(c => ({ ...c, limit: parseInt(e.target.value) }))}
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-neutral-400">
                Die {config.limit} neuesten Publikationen (nach Veröffentlichungsdatum) werden analysiert, die noch nicht bewertet wurden.
                {config.forceReanalyze && ' (Force: bereits bewertete werden erneut analysiert.)'}
              </p>
            </div>

            {/* Min word count */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="analysis-minwords" className="text-sm">
                  Min. Wortanzahl
                </Label>
                <InfoBubble text="Nur Publikationen mit mindestens so vielen Wörtern im enrichten Text analysieren. Filtert leere oder zu kurze Abstracts heraus." />
              </div>
              <Input
                id="analysis-minwords"
                type="number"
                min={0}
                max={5000}
                value={config.minWordCount}
                onChange={(e) => setConfig(c => ({ ...c, minWordCount: Math.max(0, parseInt(e.target.value) || 0) }))}
                className="w-24"
              />
            </div>

            {/* Checkboxes */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enrichedOnly}
                  onChange={(e) => setConfig(c => ({ ...c, enrichedOnly: e.target.checked }))}
                  className="rounded border-neutral-300"
                />
                <span>Nur enriched</span>
                <InfoBubble text="Nur Publikationen analysieren, die bereits Metadaten (Abstract, Keywords) aus dem Enrichment haben. Ohne Enrichment fehlt dem LLM der nötige Kontext." />
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.includePartial}
                  onChange={(e) => setConfig(c => ({ ...c, includePartial: e.target.checked }))}
                  className="rounded border-neutral-300"
                  disabled={!config.enrichedOnly}
                />
                <span className={!config.enrichedOnly ? 'text-neutral-400' : ''}>Partial einschließen</span>
                <InfoBubble text="Auch teilweise enrichte Publikationen einbeziehen (z.B. nur Keywords aber kein Abstract). Ergebnisse können weniger genau sein." />
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.forceReanalyze}
                  onChange={(e) => setConfig(c => ({ ...c, forceReanalyze: e.target.checked }))}
                  className="rounded border-neutral-300"
                />
                <span>Erneut analysieren</span>
                <InfoBubble text="Bereits analysierte Publikationen erneut bewerten. Nützlich nach Modellwechsel oder wenn sich die Bewertungskriterien geändert haben." />
              </label>
            </div>
          </div>
        )}

        {/* Progress bar */}
        {status === 'running' && (
          <div className="space-y-1">
            <Progress value={pct} />
            <div className="flex justify-between text-xs text-neutral-500">
              <span>{progress.processed} / {progress.total}</span>
              <span>{pct}%</span>
            </div>
          </div>
        )}

        {/* Current batch detail */}
        {status === 'running' && progress.currentTitle && (
          <div className="rounded-lg border p-3 space-y-2 bg-neutral-50/50">
            <p className="text-sm font-medium truncate">{progress.currentTitle}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
              {selectedModel && (
                <span>{selectedModel.label}</span>
              )}
              {progress.totalBatches > 0 && (
                <span>Batch {progress.batchIndex} / {progress.totalBatches}</span>
              )}
              {progress.tokensUsed > 0 && (
                <span>Tokens: {progress.tokensUsed.toLocaleString()}</span>
              )}
              {progress.cost > 0 && (
                <span>Kosten: ${progress.cost.toFixed(4)}</span>
              )}
              {apiKeyHint && (
                <span className="text-neutral-400">Key: <span className="font-mono">{apiKeyHint}</span></span>
              )}
            </div>
          </div>
        )}

        {/* Batch errors — show during running AND after complete/error */}
        {errors.length > 0 && (status === 'running' || status === 'complete' || status === 'cancelled' || status === 'error') && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 space-y-1">
            <p className="text-xs font-medium text-amber-700 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {errors.length} Batch-Fehler
            </p>
            <div className="max-h-[120px] overflow-y-auto">
              {errors.map((err, i) => (
                <p key={i} className="text-xs text-amber-600">{err}</p>
              ))}
            </div>
          </div>
        )}

        {/* Complete summary */}
        {status === 'complete' && completeData && completeData.total > 0 && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-2">
            <p className="text-sm font-medium text-green-800">Analyse abgeschlossen</p>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                {completeData.successful} analysiert
              </Badge>
              {completeData.failed > 0 && (
                <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                  {completeData.failed} fehlgeschlagen
                </Badge>
              )}
            </div>
            {completeData.tokensUsed > 0 && (
              <div className="flex flex-wrap gap-x-4 text-xs text-neutral-500 pt-1">
                <span>Modell: {selectedModel?.label}</span>
                <span>Tokens gesamt: {completeData.tokensUsed.toLocaleString()}</span>
                <span>Kosten gesamt: ${completeData.cost.toFixed(4)}</span>
              </div>
            )}
          </div>
        )}

        {/* Cancelled summary */}
        {status === 'cancelled' && (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 space-y-2">
            <p className="text-sm font-medium text-neutral-700">Analyse abgebrochen</p>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-neutral-200 text-neutral-600 hover:bg-neutral-200">
                {progress.processed} / {progress.total} verarbeitet
              </Badge>
              {progress.tokensUsed > 0 && (
                <Badge variant="outline" className="text-neutral-500">
                  {progress.tokensUsed.toLocaleString()} Tokens
                </Badge>
              )}
              {progress.cost > 0 && (
                <Badge variant="outline" className="text-neutral-500">
                  ${progress.cost.toFixed(4)}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Complete but nothing to analyze */}
        {status === 'complete' && completeData && completeData.total === 0 && errorMessage && (
          <div className="rounded-lg border bg-neutral-50 p-3">
            <p className="text-sm text-neutral-600">{errorMessage}</p>
          </div>
        )}

        {/* Error display */}
        {status === 'error' && errorMessage && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
            <p className="text-sm font-medium text-red-700 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              Fehler
            </p>
            <p className="text-sm text-red-600">{errorMessage}</p>
            {apiKeyHint && (
              <p className="text-xs text-red-400 pt-1">Verwendeter Key: <span className="font-mono">{apiKeyHint}</span></p>
            )}
            {keyBalance && keyBalance.effectiveBudget !== null && (
              <p className="text-xs text-red-400">
                Budget: ${keyBalance.effectiveBudget.toFixed(4)} verfügbar
                {keyBalance.accountBalance !== null && ` (Account: $${keyBalance.accountBalance.toFixed(2)}`}
                {keyBalance.accountBalance !== null && keyBalance.limitRemaining !== null && `, Key-Limit: $${keyBalance.limitRemaining.toFixed(2)}`}
                {keyBalance.accountBalance !== null && ')'}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {status === 'idle' && (
            <Button onClick={startAnalysis} size="sm">
              <Play className="mr-2 h-4 w-4" />
              Analyse starten
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
              {status === 'error' ? 'Erneut versuchen' : 'Erneut starten'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      {/* Reuse same capybara animation styles */}
      <style jsx global>{`
        @keyframes capybara-work {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
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
        .animate-capybara-scratch {
          animation: capybara-scratch 0.5s ease-in-out infinite;
        }
        .animate-capybara-happy {
          animation: capybara-happy 1.5s ease-in-out infinite;
        }
        @keyframes capybara-shrug {
          0%, 100% { transform: rotate(0deg); }
          30% { transform: rotate(-4deg); }
          70% { transform: rotate(4deg); }
        }
        .animate-capybara-shrug {
          animation: capybara-shrug 2s ease-in-out infinite;
        }
      `}</style>
    </Dialog>
  );
}
