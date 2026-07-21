// Event relevance scoring pipeline. Mirrors lib/server/analysis/batch.ts:
// pre-flight (key-balance 'init' + budget guard) → the shared runLLMBatch loop
// → 'complete'. Reuses the OpenRouter client + the generic batch runner; the
// SSE event names match the publication analysis modal so the event modal can
// reuse the same progress UI.

import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db, events as eventsTable } from '@/lib/server/db';
import {
  chatCompletionJson,
  parseJsonContent,
} from '@/lib/server/openrouter';
import {
  runLLMBatch,
  preflightBalance,
  sseBatchHooks,
  emitBatchComplete,
} from '@/lib/server/llm-batch';
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
  /** Einzel-/Auswahl-Bewertung: genau diese Events, sofern sie die Gates passieren. */
  ids?: string[];
}

export interface EventsAnalysisScope {
  events: EventRow[];
  /** Siehe AnalysisScope in lib/server/analysis/batch.ts: benannte ids, die an
   *  den Gates hängengeblieben sind. Ohne `ids` immer 0. */
  skipped: number;
}

/**
 * Der Scope EINES Event-Bewertungslaufs. Symmetrisch zu
 * buildAnalysisScopeWhere in lib/server/analysis/batch.ts, mit einem
 * begründeten Unterschied.
 *
 * Beide Gates sind Views, keine nachgebauten Prädikate (Migration
 * 20260721000002): non-force nimmt die offenen Kandidaten
 * (`event_scoring_candidates`: künftig + event_score IS NULL, inkl.
 * failed-Retry), force den ganzen Pool (`event_rescore_pool`: künftig, egal
 * ob schon bewertet). Bis 2026-07-21 stand die Force-Bedingung als
 * `event_at >= NOW()` im TypeScript und wäre damit hinter jeder künftigen
 * Verschärfung der Kandidaten-View zurückgeblieben.
 *
 * Bewusst KEIN created_at-Fenster (anders als bei den Publikationen, wo
 * SCORING_RECENT_DAYS den Altbestand vom teuren OpenRouter-Pfad fernhält):
 * `event_at >= now()` begrenzt die Menge hier schon von selbst — es gibt
 * keinen Event-Altbestand, weil vergangene Events nie wieder Kandidaten
 * werden. Ein zusätzliches Eingangsfenster würde nur frisch importierte, weit
 * in der Zukunft liegende Events willkürlich ausschließen.
 *
 * Exportiert, damit lib/server/events/analyze.test.ts das gerenderte SQL
 * prüfen kann, ohne eine DB zu brauchen.
 */
export function buildEventScopeWhere(filters: EventsAnalyzeFilters) {
  const view = sql.raw(
    filters.forceReanalyze ? 'event_rescore_pool' : 'event_scoring_candidates',
  );
  const pool = sql`${eventsTable.id} IN (SELECT id FROM ${view})`;
  // Einzel-/Auswahl-Bewertung: die benannten ids, geschnitten mit dem Pool
  // (ein vergangenes Event bleibt also auch dann außen vor, wenn man es
  // ausdrücklich benennt). sql.param()::uuid[] wegen des Pooler-Bugs bei
  // barem ${array} (Memory drizzle-any-array-prod-bug).
  return filters.ids?.length
    ? and(pool, sql`${eventsTable.id} = ANY(${sql.param(filters.ids)}::uuid[])`)
    : pool;
}

/** Upcoming events awaiting analysis (or all upcoming when forcing). */
export async function fetchEventsForAnalysis(
  filters: EventsAnalyzeFilters,
): Promise<EventsAnalysisScope> {
  const events = await db
    .select()
    .from(eventsTable)
    .where(buildEventScopeWhere(filters))
    .orderBy(asc(eventsTable.eventAt))
    .limit(filters.ids?.length ?? filters.limit);

  return { events, skipped: filters.ids ? filters.ids.length - events.length : 0 };
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
  /** Ausdrücklich benannte ids, die an den Gates hängengeblieben sind. */
  skipped?: number;
}

const clamp01 = (n: unknown): number => Math.max(0, Math.min(1, Number(n) || 0));

export async function runEventsAnalysisBatch(
  opts: EventsAnalysisRunOptions,
): Promise<void> {
  const { events, apiKey, model, batchSize, abortSignal, emit, skipped } = opts;

  // Pre-flight: masked-key + balance 'init', and an early abort if the budget
  // can't cover a single call. Shared with the publication runner.
  if (!(await preflightBalance({ apiKey, total: events.length, model, emit }))) {
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
    hooks: sseBatchHooks<EventRow>(emit),
  });

  emitBatchComplete(emit, result, { skipped });
}
