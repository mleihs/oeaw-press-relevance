// Generic LLM batch runner — the shared loop behind every "analyze N rows via
// OpenRouter in batches" pipeline (publication scoring, social topic extraction,
// event scoring). It owns ONLY the mechanics that were duplicated verbatim:
// batch iteration, abort handling, the per-batch try/catch with the
// isFatalLlmError stop-to-save-credits break, token/cost accumulation, the
// inter-batch delay, and the success/failure tally.
//
// What it deliberately does NOT own (kept caller-side, because it differs per
// feature): the empty-row short-circuit, the LLM call + prompt, result→row
// pairing + the DB write, and the SSE wire protocol. Callers map the NEUTRAL
// lifecycle hooks below onto their own event names (publications use
// init/progress/error/complete/cancelled; social uses
// analyzing/progress/error/cancelled), so existing modals stay byte-compatible.
//
// The budget pre-flight (`preflightBalance` below) IS offered here as an opt-in
// helper, because the publication + event runners emit a byte-identical
// 'init'/'error'/'complete' gate. Social opts out (no per-run budget gate).

import { checkKeyBalance, isFatalLlmError } from '@/lib/server/openrouter';
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

type SseEmit = (type: string, data: unknown) => void;

/**
 * The neutral→SSE hook mapping shared verbatim by the publication and event
 * analysis runners: `onBatchStart`→'progress', `onError`→'error',
 * `onCancelled`→'cancelled', with the exact field names the (shared) analysis
 * modal expects. Requires each item to carry a `title` (used for the
 * `current_title` progress label). Pass to `runLLMBatch({ hooks: ... })`.
 */
export function sseBatchHooks<TItem extends { title: string }>(
  emit: SseEmit,
): NonNullable<RunLLMBatchOptions<TItem, unknown>['hooks']> {
  return {
    onBatchStart: (p) =>
      emit('progress', {
        processed: p.processed,
        total: p.total,
        current_title: p.batch[0].title,
        batch_index: p.batchIndex,
        total_batches: p.totalBatches,
        tokens_used: p.tokensUsed,
        cost: p.cost,
      }),
    onError: (e) =>
      emit('error', { message: e.message, batch_start: e.batchStartIndex, fatal: e.fatal }),
    onCancelled: (p) =>
      emit('cancelled', { processed: p.processed, successful: p.successful, total: p.total }),
  };
}

/**
 * Emits the terminal 'complete' frame the analysis modal expects — but NOT on
 * abort, where the 'cancelled' frame already fired from `onCancelled`. Shared by
 * the publication and event runners.
 *
 * `skipped` zählt Einträge, die der Aufrufer ausdrücklich benannt hat (ids),
 * die aber an den Bewertbarkeits-Gates hängengeblieben sind. Ohne diese Zahl
 * stünde im Modal „0 bewertet" ohne jeden Grund.
 */
export function emitBatchComplete(
  emit: SseEmit,
  result: LLMBatchResult,
  extra: { skipped?: number } = {},
): void {
  if (!result.cancelled) {
    emit('complete', {
      processed: result.processed,
      total: result.total,
      successful: result.successful,
      failed: result.failed,
      tokens_used: result.tokensUsed,
      cost: result.cost,
      ...(extra.skipped ? { skipped: extra.skipped } : {}),
    });
  }
}

export interface PreflightBalanceArgs {
  apiKey: string;
  /** Row count for the run — drives the 'init' frame and the zero tally. */
  total: number;
  model: string;
  emit: (type: string, data: unknown) => void;
}

/**
 * Shared OpenRouter budget pre-flight for the publication + event analysis
 * runners. Emits the 'init' frame (masked key + live key balance); on an
 * exhausted budget (<$0.01 effective) emits a fatal 'error' plus a zero
 * 'complete' and returns false so the caller aborts before spending anything.
 * Returns true to proceed. The error message appends whatever of the key-limit
 * / account-balance figures are known (empty parenthetical when neither is).
 */
export async function preflightBalance(
  args: PreflightBalanceArgs,
): Promise<boolean> {
  const { apiKey, total, model, emit } = args;

  const maskedKey = apiKey.length > 8 ? '...' + apiKey.slice(-8) : '***';
  const keyInfo = await checkKeyBalance(apiKey);

  emit('init', {
    total,
    model,
    api_key_hint: maskedKey,
    key_balance: keyInfo,
  });

  if (keyInfo.effectiveBudget !== null && keyInfo.effectiveBudget < 0.01) {
    const parts: string[] = [];
    if (keyInfo.limitRemaining !== null) {
      parts.push(`Key-Limit: $${keyInfo.limitRemaining.toFixed(4)} verbleibend`);
    }
    if (keyInfo.accountBalance !== null) {
      parts.push(`Account-Guthaben: $${keyInfo.accountBalance.toFixed(4)}`);
    }
    const detail = parts.length > 0 ? ` (${parts.join(', ')})` : '';
    emit('error', {
      message: `OpenRouter-Budget aufgebraucht: $${keyInfo.effectiveBudget.toFixed(4)} verfügbar${detail}. Bitte Credits aufladen auf openrouter.ai/settings/credits.`,
      fatal: true,
    });
    emit('complete', {
      processed: 0,
      total,
      successful: 0,
      failed: total,
      tokens_used: 0,
      cost: 0,
    });
    return false;
  }
  return true;
}
