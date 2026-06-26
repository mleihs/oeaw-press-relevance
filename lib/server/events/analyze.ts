// Event relevance scoring pipeline. Mirrors lib/server/analysis/batch.ts:
// pre-flight (key-balance 'init' + budget guard) → the shared runLLMBatch loop
// → 'complete'. Reuses the OpenRouter client + the generic batch runner; the
// SSE event names match the publication analysis modal so the event modal can
// reuse the same progress UI.

import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db, events as eventsTable } from '@/lib/server/db';
import {
  chatCompletionJson,
  parseJsonContent,
  checkKeyBalance,
} from '@/lib/server/openrouter';
import { runLLMBatch } from '@/lib/server/llm-batch';
import { computeEventScore } from '@/lib/shared/scoring';
import { getCurrentEventScoreWeights } from './score-weights';
import {
  SYSTEM_PROMPT,
  buildEventEvaluationPrompt,
  type EventAnalysisResult,
} from './prompts';
import type { EventRow } from './to-api';

export interface EventsAnalyzeFilters {
  limit: number;
  batchSize: number;
  /** Re-score everything upcoming, not just analysis_status='pending'. */
  forceReanalyze?: boolean;
}

/** Upcoming events awaiting analysis (or all upcoming when forcing). */
export async function fetchEventsForAnalysis(
  filters: EventsAnalyzeFilters,
): Promise<EventRow[]> {
  const clauses = [gte(eventsTable.eventAt, sql`NOW()`)];
  if (!filters.forceReanalyze) {
    clauses.push(eq(eventsTable.analysisStatus, 'pending'));
  }
  return db
    .select()
    .from(eventsTable)
    .where(and(...clauses))
    .orderBy(asc(eventsTable.eventAt))
    .limit(filters.limit);
}

/** One LLM call for a batch of events → parsed evaluations + cost. Throws on a
 *  malformed response so the runner marks the batch failed. */
export async function analyzeEvents(
  events: EventRow[],
  apiKey: string,
  model: string,
): Promise<{ results: EventAnalysisResult[]; tokensUsed: number; cost: number }> {
  const { content, tokensUsed, cost } = await chatCompletionJson({
    system: SYSTEM_PROMPT,
    user: buildEventEvaluationPrompt(events),
    apiKey,
    model,
    maxTokens: 350 * events.length + 200,
    temperature: 0.4,
  });
  const parsed = parseJsonContent<{ evaluations?: EventAnalysisResult[] }>(content);
  if (!parsed.evaluations || !Array.isArray(parsed.evaluations)) {
    throw new Error('LLM response missing evaluations array');
  }
  return { results: parsed.evaluations, tokensUsed, cost };
}

export interface EventsAnalysisRunOptions {
  events: EventRow[];
  apiKey: string;
  model: string;
  batchSize: number;
  abortSignal: AbortSignal;
  emit: (type: string, data: unknown) => void;
}

const clamp01 = (n: unknown): number => Math.max(0, Math.min(1, Number(n) || 0));

export async function runEventsAnalysisBatch(
  opts: EventsAnalysisRunOptions,
): Promise<void> {
  const { events, apiKey, model, batchSize, abortSignal, emit } = opts;

  // Pre-flight (same shape as the publication analysis modal expects).
  const maskedKey = apiKey.length > 8 ? '...' + apiKey.slice(-8) : '***';
  const keyInfo = await checkKeyBalance(apiKey);
  emit('init', {
    total: events.length,
    model,
    api_key_hint: maskedKey,
    key_balance: keyInfo,
  });

  if (keyInfo.effectiveBudget !== null && keyInfo.effectiveBudget < 0.01) {
    emit('error', {
      message: `OpenRouter-Budget aufgebraucht: $${keyInfo.effectiveBudget.toFixed(4)} verfügbar. Bitte Credits aufladen auf openrouter.ai/settings/credits.`,
      fatal: true,
    });
    emit('complete', {
      processed: 0,
      total: events.length,
      successful: 0,
      failed: events.length,
      tokens_used: 0,
      cost: 0,
    });
    return;
  }

  // Current team-configured weighting, so freshly-analyzed events use the same
  // weights as the recompute behind the Settings card.
  const weights = await getCurrentEventScoreWeights();

  const result = await runLLMBatch<EventRow, EventAnalysisResult>({
    items: events,
    apiKey,
    model,
    batchSize,
    abortSignal,
    analyze: analyzeEvents,
    applyResults: async (batch, results, ctx) => {
      let ok = 0;
      for (let j = 0; j < results.length && j < batch.length; j++) {
        const r = results[j];
        const dims = {
          public_appeal: clamp01(r.public_appeal),
          scientific_significance: clamp01(r.scientific_significance),
          reach: clamp01(r.reach),
          timeliness: clamp01(r.timeliness),
        };
        await db
          .update(eventsTable)
          .set({
            analysisStatus: 'analyzed',
            eventScore: computeEventScore(dims, weights),
            publicAppeal: dims.public_appeal,
            scientificSignificance: dims.scientific_significance,
            reach: dims.reach,
            timeliness: dims.timeliness,
            pitchSuggestion: r.pitch_suggestion?.trim() || null,
            suggestedAngle: r.suggested_angle?.trim() || null,
            targetAudience: r.target_audience?.trim() || null,
            reasoning: r.reasoning?.trim() || null,
            llmModel: ctx.model,
            analysisCost: ctx.cost / results.length,
            analyzedAt: sql`NOW()`,
          })
          .where(eq(eventsTable.id, batch[j].id));
        ok++;
      }
      return ok;
    },
    markFailed: async (batch) => {
      await db
        .update(eventsTable)
        .set({ analysisStatus: 'failed' })
        .where(inArray(eventsTable.id, batch.map((e) => e.id)));
    },
    hooks: {
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
      onError: (e) => emit('error', { message: e.message, batch_start: e.batchStartIndex, fatal: e.fatal }),
      onCancelled: (p) => emit('cancelled', { processed: p.processed, successful: p.successful, total: p.total }),
    },
  });

  if (!result.cancelled) {
    emit('complete', {
      processed: result.processed,
      total: result.total,
      successful: result.successful,
      failed: result.failed,
      tokens_used: result.tokensUsed,
      cost: result.cost,
    });
  }
}
