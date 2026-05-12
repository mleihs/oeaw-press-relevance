import { and, eq, gte, inArray } from 'drizzle-orm';
import { db, publications, descNullsLast } from '@/lib/server/db';
import {
  analyzePublications,
  calculatePressScore,
  checkKeyBalance,
} from './openrouter';
import type { PublicationForPrompt } from './prompts';
import { publicationToApi } from '../publications/to-api';

export interface AnalysisBatchFilters {
  limit: number;
  batchSize: number;
  minWordCount: number;
  forceReanalyze: boolean;
  enrichedOnly: boolean;
  includePartial: boolean;
}

/**
 * Coerces the raw POST body into a normalized filter object. Numeric fields
 * are capped (not rejected) to preserve the existing laissez-faire UI
 * contract: pages can pass `limit: 5000` and expect "at most 1000".
 */
export function parseAnalysisBatchBody(
  body: Record<string, unknown>,
): AnalysisBatchFilters {
  return {
    limit: Math.min((body.limit as number) || 20, 1000),
    batchSize: Math.min((body.batchSize as number) || 3, 5),
    minWordCount: (body.minWordCount as number) || 0,
    forceReanalyze: Boolean(body.forceReanalyze),
    enrichedOnly: body.enrichedOnly !== false,
    includePartial: Boolean(body.includePartial),
  };
}

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

  let processed = 0;
  let successful = 0;
  let totalTokens = 0;
  let totalCost = 0;

  // Masked key for client display (last 8 chars only).
  const maskedKey = apiKey.length > 8 ? '...' + apiKey.slice(-8) : '***';
  const keyInfo = await checkKeyBalance(apiKey);

  emit('init', {
    total: pubs.length,
    model,
    api_key_hint: maskedKey,
    key_balance: keyInfo,
  });

  // Abort early if the effective budget (min of key limit and account
  // balance) won't cover even a single analysis call.
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
      total: pubs.length,
      successful: 0,
      failed: pubs.length,
      tokens_used: 0,
      cost: 0,
    });
    return;
  }

  for (let i = 0; i < pubs.length; i += batchSize) {
    if (abortSignal.aborted) {
      emit('cancelled', { processed, successful, total: pubs.length });
      return;
    }
    const batch = pubs.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(pubs.length / batchSize);

    emit('progress', {
      processed,
      total: pubs.length,
      current_title: batch[0].title,
      batch_index: batchIndex,
      total_batches: totalBatches,
      tokens_used: totalTokens,
      cost: totalCost,
    });

    try {
      const { results, tokensUsed, cost } = await analyzePublications(
        batch,
        apiKey,
        model,
      );
      totalTokens += tokensUsed;
      totalCost += cost;

      for (let j = 0; j < results.length && j < batch.length; j++) {
        const result = results[j];
        const pub = batch[j];
        const pressScore = calculatePressScore(result);

        await db
          .update(publications)
          .set({
            analysisStatus: 'analyzed',
            pressScore,
            publicAccessibility: result.public_accessibility,
            societalRelevance: result.societal_relevance,
            noveltyFactor: result.novelty_factor,
            storytellingPotential: result.storytelling_potential,
            mediaTimeliness: result.media_timeliness,
            pitchSuggestion: result.pitch_suggestion,
            targetAudience: result.target_audience,
            suggestedAngle: result.suggested_angle,
            reasoning: result.reasoning,
            haiku: result.haiku ?? null,
            llmModel: model,
            analysisCost: cost / results.length,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(publications.id, pub.id));

        successful++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const isFatal =
        (/\b402\b/.test(message) && /credits|afford|max_tokens|Budget/i.test(message)) ||
        (/\b401\b/.test(message) && /unauthorized|invalid/i.test(message));

      console.error(`[Analysis] Batch error at index ${i}:`, message);
      emit('error', { message, batch_start: i, fatal: isFatal });

      for (const pub of batch) {
        await db
          .update(publications)
          .set({
            analysisStatus: 'failed',
            updatedAt: new Date().toISOString(),
          })
          .where(eq(publications.id, pub.id));
      }

      if (isFatal) {
        processed += batch.length;
        break;
      }
    }

    processed += batch.length;

    if (i + batchSize < pubs.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  emit('complete', {
    processed,
    total: pubs.length,
    successful,
    failed: processed - successful,
    tokens_used: totalTokens,
    cost: totalCost,
  });
}
