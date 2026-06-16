// Generic LLM batch runner — the shared loop behind every "analyze N rows via
// OpenRouter in batches" pipeline (publication scoring, social topic extraction,
// event scoring). It owns ONLY the mechanics that were duplicated verbatim:
// batch iteration, abort handling, the per-batch try/catch with the
// isFatalLlmError stop-to-save-credits break, token/cost accumulation, the
// inter-batch delay, and the success/failure tally.
//
// What it deliberately does NOT own (kept caller-side, because it differs per
// feature): pre-flight (budget check, "init" emit, empty-row short-circuit),
// the LLM call + prompt, result→row pairing + the DB write, and the SSE wire
// protocol. Callers map the NEUTRAL lifecycle hooks below onto their own event
// names (publications use init/progress/error/complete/cancelled; social uses
// analyzing/progress/error/cancelled), so existing modals stay byte-compatible.

import { isFatalLlmError } from '@/lib/server/openrouter';
import { log } from '@/lib/server/log';

export interface LLMBatchProgress<TItem> {
  /** The rows in the batch about to be analyzed. */
  batch: TItem[];
  /** Items finished (successful + failed) BEFORE this batch. */
  processed: number;
  successful: number;
  failed: number;
  total: number;
  /** 1-based. */
  batchIndex: number;
  totalBatches: number;
  tokensUsed: number;
  cost: number;
}

export interface LLMBatchResult {
  processed: number;
  successful: number;
  failed: number;
  tokensUsed: number;
  cost: number;
  total: number;
  /** True when the loop stopped early because abortSignal fired. */
  cancelled: boolean;
}

export interface RunLLMBatchOptions<TItem, TResult> {
  items: TItem[];
  apiKey: string;
  model: string;
  batchSize: number;
  /** Call the LLM for one batch. Throws on LLM error (classified via
   *  isFatalLlmError to decide whether to stop the whole run). */
  analyze: (
    batch: TItem[],
    apiKey: string,
    model: string,
  ) => Promise<{ results: TResult[]; tokensUsed: number; cost: number }>;
  /** Pair results to rows and persist them. Returns how many rows were written
   *  successfully (the rest of the batch count toward `failed`). Owns the
   *  pairing policy (index-match vs positional vs write-all). */
  applyResults: (
    batch: TItem[],
    results: TResult[],
    ctx: { cost: number; model: string },
  ) => Promise<number>;
  /** Mark a whole batch failed (called when `analyze` throws). */
  markFailed: (batch: TItem[]) => Promise<void>;
  abortSignal?: AbortSignal;
  /** Delay between batches; default 1000ms. */
  batchDelayMs?: number;
  hooks?: {
    onBatchStart?: (p: LLMBatchProgress<TItem>) => void;
    onError?: (e: { message: string; fatal: boolean; batchStartIndex: number }) => void;
    onCancelled?: (p: { processed: number; successful: number; failed: number; total: number }) => void;
  };
}

export async function runLLMBatch<TItem, TResult>(
  opts: RunLLMBatchOptions<TItem, TResult>,
): Promise<LLMBatchResult> {
  const {
    items,
    apiKey,
    model,
    batchSize,
    analyze,
    applyResults,
    markFailed,
    abortSignal,
    batchDelayMs = 1000,
    hooks = {},
  } = opts;

  const total = items.length;
  let successful = 0;
  let failed = 0;
  let tokensUsed = 0;
  let cost = 0;
  let cancelled = false;

  for (let i = 0; i < items.length; i += batchSize) {
    if (abortSignal?.aborted) {
      cancelled = true;
      hooks.onCancelled?.({ processed: successful + failed, successful, failed, total });
      break;
    }

    const batch = items.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(items.length / batchSize);

    hooks.onBatchStart?.({
      batch,
      processed: successful + failed,
      successful,
      failed,
      total,
      batchIndex,
      totalBatches,
      tokensUsed,
      cost,
    });

    try {
      const { results, tokensUsed: t, cost: c } = await analyze(batch, apiKey, model);
      tokensUsed += t;
      cost += c;
      const ok = await applyResults(batch, results, { cost: c, model });
      successful += ok;
      // Items the LLM didn't return a usable result for count as failed in the
      // tally (the rows stay untouched and will be retried on the next run).
      failed += batch.length - ok;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const fatal = isFatalLlmError(message);
      log.error('llm_batch_error', { batchStart: i, message, fatal });
      hooks.onError?.({ message, fatal, batchStartIndex: i });
      await markFailed(batch);
      failed += batch.length;
      if (fatal) break;
    }

    if (i + batchSize < items.length) {
      await new Promise((r) => setTimeout(r, batchDelayMs));
    }
  }

  return {
    processed: successful + failed,
    successful,
    failed,
    tokensUsed,
    cost,
    total,
    cancelled,
  };
}
