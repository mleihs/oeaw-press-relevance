import 'server-only';
import { and, eq, gte, inArray } from 'drizzle-orm';
import { db, publications, descNullsLast } from '@/lib/server/db';
import { analyzePublications } from './analyze';
import { calculatePressScore } from './score';
import {
  runLLMBatch,
  preflightBalance,
  sseBatchHooks,
  emitBatchComplete,
} from '@/lib/server/llm-batch';
import type { AnalysisResult } from '@/lib/shared/types';
import type { PublicationForPrompt } from './prompts';
import { publicationToApi } from '../publications/to-api';
import type { AnalysisBatchPayload } from '@/lib/shared/schemas';

// Wire shape and internal filter shape match 1:1 (camelCase throughout).
export type AnalysisBatchFilters = AnalysisBatchPayload;

export async function fetchPublicationsForAnalysis(
  filters: AnalysisBatchFilters,
): Promise<PublicationForPrompt[]> {
  const clauses = [];
  if (!filters.forceReanalyze) {
    clauses.push(eq(publications.analysisStatus, 'pending'));
  }
  if (filters.enrichedOnly) {
    if (filters.includePartial) {
      clauses.push(
        inArray(publications.enrichmentStatus, ['enriched', 'partial']),
      );
    } else {
      clauses.push(eq(publications.enrichmentStatus, 'enriched'));
    }
  }
  if (filters.minWordCount > 0) {
    clauses.push(gte(publications.wordCount, filters.minWordCount));
  }

  const rows = await db.query.publications.findMany({
    where: clauses.length > 0 ? and(...clauses) : undefined,
    orderBy: descNullsLast(publications.publishedAt),
    limit: filters.limit,
    with: {
      orgunitPublications: {
        columns: { orgunitId: true },
        with: {
          orgunit: {
            columns: { akronymDe: true, nameDe: true },
          },
        },
      },
    },
  });

  return rows.map((row): PublicationForPrompt => {
    const orgunits = (row.orgunitPublications ?? [])
      .map((op) => op.orgunit)
      .filter((o): o is NonNullable<typeof o> => o !== null)
      .map((o) => ({ akronym_de: o.akronymDe, name_de: o.nameDe }));
    return { ...publicationToApi(row), orgunits };
  });
}

export interface AnalysisBatchRunOptions {
  pubs: PublicationForPrompt[];
  apiKey: string;
  model: string;
  batchSize: number;
  abortSignal: AbortSignal;
  emit: (type: string, data: unknown) => void;
}

/**
 * Drives the LLM analysis pipeline. Emits SSE-compatible events via the
 * `emit` callback so the route layer owns the streaming machinery:
 *   - 'init'      pubs.length + model + key balance
 *   - 'progress'  per batch
 *   - 'cancelled' on client-disconnect mid-loop
 *   - 'error'     per-batch upstream errors (fatal=true on billing/auth)
 *   - 'complete'  final tally
 *
 * On fatal billing/auth errors the loop stops immediately to save credits.
 * Per-pub failures mark the row analysis_status='failed' but keep the loop
 * going. Caller is responsible for closing the stream.
 */
export async function runAnalysisBatch(
  opts: AnalysisBatchRunOptions,
): Promise<void> {
  const { pubs, apiKey, model, batchSize, abortSignal, emit } = opts;

  // Pre-flight: masked-key + balance 'init', and an early abort if the budget
  // can't cover a single call. Shared with the event runner (preflightBalance
  // emits the 'init'/'error'/'complete' frames this modal expects).
  if (!(await preflightBalance({ apiKey, total: pubs.length, model, emit }))) {
    return;
  }

  // The batch loop, abort/fatal/delay/tally machinery lives in runLLMBatch; the
  // hooks below reproduce the exact SSE payloads the analysis modal expects.
  const result = await runLLMBatch<PublicationForPrompt, AnalysisResult>({
    items: pubs,
    apiKey,
    model,
    batchSize,
    abortSignal,
    analyze: analyzePublications,
    applyResults: async (batch, results, ctx) => {
      let ok = 0;
      for (let j = 0; j < results.length && j < batch.length; j++) {
        const r = results[j];
        await db
          .update(publications)
          .set({
            analysisStatus: 'analyzed',
            pressScore: calculatePressScore(r),
            publicAccessibility: r.public_accessibility,
            societalRelevance: r.societal_relevance,
            noveltyFactor: r.novelty_factor,
            storytellingPotential: r.storytelling_potential,
            mediaTimeliness: r.media_timeliness,
            pitchSuggestion: r.pitch_suggestion,
            targetAudience: r.target_audience,
            suggestedAngle: r.suggested_angle,
            reasoning: r.reasoning,
            haiku: r.haiku ?? null,
            llmModel: ctx.model,
            analysisCost: ctx.cost / results.length,
            // updated_at is set by the publications_set_updated_at trigger.
          })
          .where(eq(publications.id, batch[j].id));
        ok++;
      }
      return ok;
    },
    markFailed: async (batch) => {
      await db
        .update(publications)
        .set({ analysisStatus: 'failed' })
        .where(inArray(publications.id, batch.map((p) => p.id)));
    },
    hooks: sseBatchHooks<PublicationForPrompt>(emit),
  });

  emitBatchComplete(emit, result);
}
