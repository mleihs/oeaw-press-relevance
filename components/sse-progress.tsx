'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle2, XCircle, Play } from 'lucide-react';
import { getApiHeaders } from '@/lib/client/stores/settings-store';
import { consumeSSE } from '@/lib/client/sse';

interface SSEProgressProps {
  title: string;
  description: string;
  endpoint: string;
  requestBody: Record<string, unknown>;
  onComplete?: () => void;
}

interface ProgressState {
  status: 'idle' | 'running' | 'complete' | 'error';
  processed: number;
  total: number;
  successful?: number;
  failed?: number;
  currentTitle?: string;
  tokensUsed?: number;
  cost?: number;
  errorMessage?: string;
}

export function SSEProgress({ title, description, endpoint, requestBody, onComplete }: SSEProgressProps) {
  const [state, setState] = useState<ProgressState>({
    status: 'idle',
    processed: 0,
    total: 0,
  });

  const startProcess = useCallback(async () => {
    setState({ status: 'running', processed: 0, total: 0 });

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const err = await response.json();
        setState(s => ({ ...s, status: 'error', errorMessage: err.error || 'Request failed' }));
        return;
      }

      // Check if it's a simple JSON response (no publications to process)
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        setState({
          status: 'complete',
          processed: 0,
          total: 0,
          successful: 0,
          errorMessage: data.message,
        });
        onComplete?.();
        return;
      }

      // SSE stream
      await consumeSSE(response, (eventType, data) => {
        if (eventType === 'progress') {
          setState(s => ({
            ...s,
            status: 'running',
            processed: data.processed ?? s.processed,
            total: data.total ?? s.total,
            currentTitle: data.current_title,
            tokensUsed: data.tokens_used,
            cost: data.cost,
          }));
        } else if (eventType === 'complete') {
          setState({
            status: 'complete',
            processed: data.processed ?? data.total,
            total: data.total,
            successful: data.successful,
            failed: data.failed,
            tokensUsed: data.tokens_used,
            cost: data.cost,
          });
          onComplete?.();
        } else if (eventType === 'error') {
          setState(s => ({
            ...s,
            errorMessage: data.message,
          }));
        }
      });
    } catch (err) {
      setState(s => ({
        ...s,
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Connection failed',
      }));
    }
  }, [endpoint, requestBody, onComplete]);

  const pct = state.total > 0 ? Math.round((state.processed / state.total) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {state.status === 'running' && <Loader2 className="h-4 w-4 animate-spin" />}
          {state.status === 'complete' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
          {state.status === 'error' && <XCircle className="h-4 w-4 text-red-500" />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {state.status === 'idle' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{description}</p>
            <Button onClick={startProcess} size="sm">
              <Play className="mr-2 h-4 w-4" />
              Start
            </Button>
          </div>
        )}

        {state.status === 'running' && (
          <div className="space-y-2">
            <Progress value={pct} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{state.processed} / {state.total}</span>
              <span>{pct}%</span>
            </div>
            {state.currentTitle && (
              <p className="text-xs text-muted-foreground truncate">
                Processing: {state.currentTitle}
              </p>
            )}
            {state.cost !== undefined && state.cost > 0 && (
              <p className="text-xs text-muted-foreground">
                Cost: ${state.cost.toFixed(4)} | Tokens: {state.tokensUsed?.toLocaleString()}
              </p>
            )}
          </div>
        )}

        {state.status === 'complete' && (
          <div className="space-y-2">
            <div className="flex gap-4 text-sm">
              {state.successful !== undefined && (
                <span className="text-green-600 dark:text-green-400">{state.successful} successful</span>
              )}
              {state.failed !== undefined && state.failed > 0 && (
                <span className="text-red-600 dark:text-red-400">{state.failed} failed</span>
              )}
            </div>
            {state.cost !== undefined && state.cost > 0 && (
              <p className="text-xs text-muted-foreground">
                Total cost: ${state.cost.toFixed(4)} | Tokens: {state.tokensUsed?.toLocaleString()}
              </p>
            )}
            {state.errorMessage && (
              <p className="text-sm text-muted-foreground">{state.errorMessage}</p>
            )}
            <Button onClick={startProcess} size="sm" variant="outline">
              Run Again
            </Button>
          </div>
        )}

        {state.status === 'error' && (
          <div className="space-y-2">
            <p className="text-sm text-red-600 dark:text-red-400">{state.errorMessage || 'An error occurred'}</p>
            <Button onClick={startProcess} size="sm" variant="outline">
              Retry
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
