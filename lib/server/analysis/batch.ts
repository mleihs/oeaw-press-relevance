import 'server-only';
import { eq, inArray, sql } from 'drizzle-orm';
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
import type { ScoringBatchPayload } from '@/lib/shared/schemas';
import { SCORING_RECENT_DAYS } from '@/lib/shared/dashboard';

// Wire shape and internal filter shape match 1:1 (camelCase throughout).
export type AnalysisBatchFilters = ScoringBatchPayload;

/**
 * Der Scope EINES „Bewerten"-Laufs über OpenRouter. Zwei Gates, beide
 * unverhandelbar:
 *
 *  1. WAS ist bewertbar — die kanonischen Views (Migration 20260721000001).
 *     Non-force nimmt die offenen Kandidaten (`publication_scoring_candidates`),
 *     force den ganzen Re-Score-Pool (`publication_rescore_pool`: bewertbar,
 *     aber evtl. schon bewertet → Überschreiben). Force ignoriert also NICHT
 *     mehr jedes Prädikat (bis 2026-07-21 war die force-Bedingung schlicht
 *     `undefined`): archiviert / ITA / ohne Inhalt bleibt in BEIDEN Fällen außen
 *     vor.
 *  2. WIE ALT darf es sein — `created_at` innerhalb SCORING_RECENT_DAYS.
 *     Dieser Weg kostet OpenRouter-Guthaben; der Altbestand gehört dem
 *     kostenlosen In-Chat-Pfad (scripts/session-pipeline.mjs). `limit` ist damit
 *     nur noch ein Sicherheitsdeckel, kein Scope-Instrument.
 *
 * Exportiert, damit lib/server/analysis/batch.test.ts das gerenderte SQL prüfen
 * kann, ohne eine DB zu brauchen.
 */
export function buildAnalysisScopeWhere(filters: AnalysisBatchFilters) {
  const pool = sql.raw(
    filters.forceReanalyze ? 'publication_rescore_pool' : 'publication_scoring_candidates',
  );
  // Einzel-/Auswahl-Bewertung: genau die benannten ids, geschnitten mit dem
  // Pool. Kein Zeitfenster — wer eine Publikation vor sich hat, will SIE
  // bewerten, nicht „was neu ist". Das Array via sql.param()::uuid[] binden;
  // ein bares ${array} scheitert am Supabase-Pooler (Memory
  // drizzle-any-array-prod-bug).
  if (filters.ids?.length) {
    return sql`${publications.id} IN (SELECT id FROM ${pool})
      AND ${publications.id} = ANY(${sql.param(filters.ids)}::uuid[])`;
  }
  return sql`${publications.id} IN (SELECT id FROM ${pool})
    AND ${publications.createdAt} >= now() - make_interval(days => ${SCORING_RECENT_DAYS}::int)`;
}

export async function fetchPublicationsForAnalysis(
  filters: AnalysisBatchFilters,
): Promise<PublicationForPrompt[]> {
  const rows = await db.query.publications.findMany({
    where: buildAnalysisScopeWhere(filters),
    // Nach Eingangsdatum, nicht nach Erscheinungsdatum: „zuletzt hereingekommen"
    // ist die Reihenfolge, in der die Redaktion neue Kandidaten erwartet.
    orderBy: descNullsLast(publications.createdAt),
    // Bei ids zählt die benannte Menge, nicht der Batch-Deckel: sonst würde
    // eine Auswahl von 30 stillschweigend auf den Default 20 gekürzt.
    limit: filters.ids?.length ?? filters.limit,
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
  /** Ausdrücklich benannte ids, die an den Gates hängengeblieben sind. */
  skipped?: number;
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
  const { pubs, apiKey, model, batchSize, abortSignal, emit, skipped } = opts;

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

  emitBatchComplete(emit, result, { skipped });
}
