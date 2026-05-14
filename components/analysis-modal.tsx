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
import { TintBadge } from '@/components/tint-badge';
import { CapybaraModalAvatar } from '@/components/capybara-modal-avatar';
import { getApiHeaders, loadSettings } from '@/lib/client/stores/settings-store';
import { LLM_MODELS } from '@/lib/shared/constants';
import type { ModalStatus } from '@/lib/shared/types';
import { Play, Square, RotateCcw, AlertCircle, Check } from 'lucide-react';
import { InfoBubble } from '@/components/info-bubble';

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
  recommended: { bg: 'bg-green-100 dark:bg-green-500/15', text: 'text-green-700 dark:text-green-300', label: 'Empfohlen' },
  budget: { bg: 'bg-blue-100 dark:bg-blue-500/15', text: 'text-blue-700 dark:text-blue-300', label: 'Budget' },
  balanced: { bg: 'bg-amber-100 dark:bg-amber-500/15', text: 'text-amber-900 dark:text-amber-300', label: 'Ausgewogen' },
  premium: { bg: 'bg-purple-100 dark:bg-purple-500/15', text: 'text-purple-700 dark:text-purple-300', label: 'Premium' },
  free: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Gratis' },
};

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
    model: 'deepseek/deepseek-chat',
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
            <CapybaraModalAvatar variant="analyst" state={status} />
            <div className="flex-1 min-w-0">
              <DialogTitle>Story Scout Analyse</DialogTitle>
              <DialogDescription>
                {status === 'idle' && 'Publikationen per LLM auf Story-Potenzial bewerten.'}
                {status === 'running' && `Analysiere ${progress.processed} / ${progress.total} Publikationen...`}
                {status === 'complete' && 'Analyse abgeschlossen!'}
                {status === 'cancelled' && `Analyse abgebrochen: ${progress.processed} von ${progress.total} Publikationen analysiert.`}
                {status === 'error' && 'Fehler bei der Analyse.'}
              </DialogDescription>
            </div>
            {status === 'running' && (
              <div className="text-right shrink-0">
                <span className="text-xs text-muted-foreground/70 tabular-nums block">
                  {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
                </span>
                {analysisEta && (
                  <span className="text-[10px] text-muted-foreground/70 block">
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
                <InfoBubble content={{ title: 'Modell', body: <p>Das LLM-Modell bewertet jede Publikation auf 5 Dimensionen und erstellt einen deutschen Pitch-Vorschlag. Teurere Modelle liefern differenziertere Bewertungen.</p> }} />
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
                          ? 'bg-foreground text-background'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? 'border-background' : 'border-input'
                        }`}>
                          {isSelected && <Check className="h-2.5 w-2.5" />}
                        </span>
                        <span className="font-medium text-sm flex-1">{m.label}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          isSelected ? 'bg-background/20 text-background' : `${tier.bg} ${tier.text}`
                        }`}>
                          {tier.label}
                        </span>
                        <span className={`text-xs font-mono tabular-nums ${
                          isSelected ? 'text-background/70' : 'text-muted-foreground/70'
                        }`}>
                          {m.costPerMillionTokens === 0
                            ? 'gratis'
                            : `$${m.costPerMillionTokens}/M`}
                        </span>
                      </div>
                      <p className={`text-xs mt-0.5 pl-6 ${
                        isSelected ? 'text-background/60' : 'text-muted-foreground/70'
                      }`}>
                        {m.description}
                      </p>
                      {costFor100 > 0 && (
                        <p className={`text-[10px] mt-0.5 pl-6 ${
                          isSelected ? 'text-background/40' : 'text-muted-foreground/50'
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
            <div className="rounded-lg border bg-muted/50 p-3 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Geschätzte Kosten</span>
                <span className="font-mono text-xs">
                  {estimatedCost === 0
                    ? 'Gratis'
                    : `~$${estimatedCost.toFixed(4)} für ${config.limit} Pubs`}
                </span>
              </div>
              {keyBalance && keyBalance.effectiveBudget !== null && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground/70">Budget verbleibend</span>
                  <span className={`font-mono ${keyBalance.effectiveBudget < 0.50 ? 'text-red-500 dark:text-red-400 font-medium' : 'text-muted-foreground'}`}>
                    ${keyBalance.effectiveBudget.toFixed(4)}
                  </span>
                </div>
              )}
              {keyBalance && keyBalance.effectiveBudget !== null && keyBalance.effectiveBudget < 0.50 && keyBalance.effectiveBudget >= 0.01 && (
                <div className="flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 rounded px-2 py-1">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span>Niedriges Guthaben, bald Credits aufladen auf openrouter.ai/settings/credits</span>
                </div>
              )}
            </div>

            {/* Limit */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="analysis-limit" className="text-sm">
                  Publikationen analysieren
                </Label>
                <InfoBubble content={{ title: 'Publikationen analysieren', body: <p>Anzahl der Publikationen, die in diesem Durchgang analysiert werden sollen. Sortiert nach Erstellungsdatum (neueste zuerst).</p> }} />
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
              <p className="text-xs text-muted-foreground/70">
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
                <InfoBubble content={{ title: 'Min. Wortanzahl', body: <p>Nur Publikationen mit mindestens so vielen Wörtern im enrichten Text analysieren. Filtert leere oder zu kurze Abstracts heraus.</p> }} />
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
                  className="rounded border-input"
                />
                <span>Nur enriched</span>
                <InfoBubble content={{ title: 'Nur enriched', body: <p>Nur Publikationen analysieren, die bereits Metadaten (Abstract, Keywords) aus dem Enrichment haben. Ohne Enrichment fehlt dem LLM der nötige Kontext.</p> }} />
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.includePartial}
                  onChange={(e) => setConfig(c => ({ ...c, includePartial: e.target.checked }))}
                  className="rounded border-input"
                  disabled={!config.enrichedOnly}
                />
                <span className={!config.enrichedOnly ? 'text-muted-foreground/70' : ''}>Partial einschließen</span>
                <InfoBubble content={{ title: 'Partial einschließen', body: <p>Auch teilweise enrichte Publikationen einbeziehen (z.B. nur Keywords aber kein Abstract). Ergebnisse können weniger genau sein.</p> }} />
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.forceReanalyze}
                  onChange={(e) => setConfig(c => ({ ...c, forceReanalyze: e.target.checked }))}
                  className="rounded border-input"
                />
                <span>Erneut analysieren</span>
                <InfoBubble content={{ title: 'Erneut analysieren', body: <p>Bereits analysierte Publikationen erneut bewerten. Nützlich nach Modellwechsel oder wenn sich die Bewertungskriterien geändert haben.</p> }} />
              </label>
            </div>
          </div>
        )}

        {/* Progress bar */}
        {status === 'running' && (
          <div className="space-y-1">
            <Progress value={pct} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{progress.processed} / {progress.total}</span>
              <span>{pct}%</span>
            </div>
          </div>
        )}

        {/* Current batch detail */}
        {status === 'running' && progress.currentTitle && (
          <div className="rounded-lg border p-3 space-y-2 bg-muted/50">
            <p className="text-sm font-medium truncate">{progress.currentTitle}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
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
                <span className="text-muted-foreground/70">Key: <span className="font-mono">{apiKeyHint}</span></span>
              )}
            </div>
          </div>
        )}

        {/* Batch errors — show during running AND after complete/error */}
        {errors.length > 0 && (status === 'running' || status === 'complete' || status === 'cancelled' || status === 'error') && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/[0.08] p-2 space-y-1">
            <p className="text-xs font-medium text-amber-900 dark:text-amber-200 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {errors.length} Batch-Fehler
            </p>
            <div className="max-h-[120px] overflow-y-auto">
              {errors.map((err, i) => (
                <p key={i} className="text-xs text-amber-800 dark:text-amber-300">{err}</p>
              ))}
            </div>
          </div>
        )}

        {/* Complete summary */}
        {status === 'complete' && completeData && completeData.total > 0 && (
          <div className="rounded-lg border border-green-200 dark:border-green-500/30 bg-green-50 dark:bg-green-500/[0.08] p-3 space-y-2">
            <p className="text-sm font-medium text-green-800 dark:text-green-200">Analyse abgeschlossen</p>
            <div className="flex flex-wrap gap-2">
              <TintBadge color="green">
                {completeData.successful} analysiert
              </TintBadge>
              {completeData.failed > 0 && (
                <TintBadge color="red">
                  {completeData.failed} fehlgeschlagen
                </TintBadge>
              )}
            </div>
            {completeData.tokensUsed > 0 && (
              <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground pt-1">
                <span>Modell: {selectedModel?.label}</span>
                <span>Tokens gesamt: {completeData.tokensUsed.toLocaleString()}</span>
                <span>Kosten gesamt: ${completeData.cost.toFixed(4)}</span>
              </div>
            )}
          </div>
        )}

        {/* Cancelled summary */}
        {status === 'cancelled' && (
          <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
            <p className="text-sm font-medium text-foreground">Analyse abgebrochen</p>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-muted text-muted-foreground hover:bg-muted">
                {progress.processed} / {progress.total} verarbeitet
              </Badge>
              {progress.tokensUsed > 0 && (
                <Badge variant="outline" className="text-muted-foreground">
                  {progress.tokensUsed.toLocaleString()} Tokens
                </Badge>
              )}
              {progress.cost > 0 && (
                <Badge variant="outline" className="text-muted-foreground">
                  ${progress.cost.toFixed(4)}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Complete but nothing to analyze */}
        {status === 'complete' && completeData && completeData.total === 0 && errorMessage && (
          <div className="rounded-lg border bg-muted/50 p-3">
            <p className="text-sm text-foreground/80">{errorMessage}</p>
          </div>
        )}

        {/* Error display */}
        {status === 'error' && errorMessage && (
          <div className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/[0.08] p-3 space-y-1">
            <p className="text-sm font-medium text-red-700 dark:text-red-300 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              Fehler
            </p>
            <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
            {apiKeyHint && (
              <p className="text-xs text-red-400 dark:text-red-300/70 pt-1">Verwendeter Key: <span className="font-mono">{apiKeyHint}</span></p>
            )}
            {keyBalance && keyBalance.effectiveBudget !== null && (
              <p className="text-xs text-red-400 dark:text-red-300/70">
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
    </Dialog>
  );
}
