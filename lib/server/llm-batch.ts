// Generic LLM batch runner — the shared loop behind every "analyze N rows via
// an LLM in batches" pipeline (publication scoring, social topic extraction,
// event scoring). It owns ONLY the mechanics that were duplicated verbatim:
// batch iteration, abort handling, the per-batch try/catch with the
// isFatalLlmError stop-to-save-credits break, token/cost accumulation, the
// inter-batch delay, and the success/failure tally.
//
// What it deliberately does NOT own (kept caller-side, because it differs per
// feature): the empty-row short-circuit, the LLM call + prompt, result→row
// pairing + the DB write, and the SSE wire protocol. Callers map the NEUTRAL
// lifecycle hooks below onto their own event names (der Bewerten-Knopf in
// lib/server/scoring/button.ts: init/progress/error/complete/cancelled; social:
// analyzing/progress/error/cancelled), so existing modals stay byte-compatible.
//
// Seit dem Bewertungskern (lib/server/scoring/run.ts) kann die Schleife mehr,
// jeweils als Option mit dem bisherigen Verhalten als Default (Social merkt
// nichts davon): mehrere Batches gleichzeitig
// (`concurrency`, Worker-Pool), ein Stopp-Grund von außen (`shouldStop`, etwa
// der Kostendeckel), eine eigene Fatal-Regel (`isFatal`) und ein eigener
// Batch-Schnitt (`partition`, damit Zwillings-Events im selben Aufruf landen).

import { isFatalLlmError } from '@/lib/server/llm-client';
import { log } from '@/lib/server/log';
import { mapPool } from '@/lib/shared/concurrency';

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
  /** Grund aus `shouldStop`, wenn die Schleife deshalb vorzeitig endete; sonst null. */
  stoppedReason: string | null;
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
  /** Delay between batches; default 1000ms. Nur bei `concurrency` 1: parallel
   *  laufende Batches haben keinen Abstand, den man einhalten könnte. */
  batchDelayMs?: number;
  /** Batches, die gleichzeitig laufen dürfen; default 1 (streng nacheinander). */
  concurrency?: number;
  /** Vor jedem neuen Batch gefragt. Ein Grund (statt null) beendet die
   *  Schleife; laufende Batches enden noch, der Grund steht in `stoppedReason`. */
  shouldStop?: () => string | null;
  /** Bricht dieser Fehler den ganzen Lauf ab? Default: isFatalLlmError auf der
   *  Meldung (Guthaben/Auth). */
  isFatal?: (err: unknown, batch: TItem[]) => boolean;
  /** Eigener Batch-Schnitt; default `batchSize` am Stück. */
  partition?: (items: TItem[]) => TItem[][];
  hooks?: {
    onBatchStart?: (p: LLMBatchProgress<TItem>) => void;
    onError?: (e: {
      message: string;
      fatal: boolean;
      batchStartIndex: number;
      /** Der gescheiterte Batch und der Fehler selbst, für Aufrufer, die nach
       *  Fehlerart unterscheiden (der Bewertungskern zerlegt Ablehnungen). */
      batch: TItem[];
      error: unknown;
    }) => void;
    onCancelled?: (p: { processed: number; successful: number; failed: number; total: number }) => void;
  };
}

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : 'Unknown error');

function sliceBatches<T>(items: T[], batchSize: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) out.push(items.slice(i, i + batchSize));
  return out;
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
    concurrency = 1,
    shouldStop,
    isFatal = (err) => isFatalLlmError(messageOf(err)),
    partition,
    hooks = {},
  } = opts;

  const batches = partition ? partition(items) : sliceBatches(items, batchSize);
  // Startposition je Batch in `items`: das Feld `batch_start` der SSE-Frames.
  const starts = batches.map((_, b) => batches.slice(0, b).reduce((n, x) => n + x.length, 0));
  const total = items.length;
  let successful = 0;
  let failed = 0;
  let tokensUsed = 0;
  let cost = 0;
  let cancelled = false;
  let fatal = false;
  let stoppedReason: string | null = null;
  const halted = () => cancelled || fatal || stoppedReason !== null;

  // Worker-Pool über die Batches. Jeder Worker prüft vor dem nächsten Batch,
  // ob die Schleife angehalten wurde (Abbruch, Fatal, Stopp-Grund); was schon
  // läuft, endet regulär und wird mitgezählt.
  await mapPool(batches, concurrency, async (batch, b) => {
    if (halted()) return;
    if (abortSignal?.aborted) {
      cancelled = true;
      hooks.onCancelled?.({ processed: successful + failed, successful, failed, total });
      return;
    }
    const reason = shouldStop?.() ?? null;
    if (reason !== null) {
      stoppedReason = reason;
      return;
    }

    hooks.onBatchStart?.({
      batch,
      processed: successful + failed,
      successful,
      failed,
      total,
      batchIndex: b + 1,
      totalBatches: batches.length,
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
      const message = messageOf(err);
      const isFatalError = isFatal(err, batch);
      log.error('llm_batch_error', { batchStart: starts[b], message, fatal: isFatalError });
      hooks.onError?.({ message, fatal: isFatalError, batchStartIndex: starts[b], batch, error: err });
      await markFailed(batch);
      failed += batch.length;
      if (isFatalError) fatal = true;
    }

    if (concurrency <= 1 && b < batches.length - 1 && !halted()) {
      await new Promise((r) => setTimeout(r, batchDelayMs));
    }
  });

  return {
    processed: successful + failed,
    successful,
    failed,
    tokensUsed,
    cost,
    total,
    cancelled,
    stoppedReason,
  };
}
