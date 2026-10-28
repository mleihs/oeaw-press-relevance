// Adapter der Publikationen für den Bewertungskern (lib/server/scoring/run.ts):
// Kandidaten, Modellaufruf, Texte, Schreiben. Gegenstück zu
// lib/server/events/scoring-adapter.ts; nur die Publikationen tragen ein Haiku.

import { sql, type SQL } from 'drizzle-orm';
import { db, descNullsLast, publications } from '@/lib/server/db';
import {
  markPublicationsFailed,
  writePublicationEvaluations,
} from '@/lib/server/scoring/persist';
import type { CandidateQuery, ScoringAdapter } from '@/lib/server/scoring/types';
import { SCORE_DIMENSIONS } from '@/lib/shared/constants';
import { SCORING_RECENT_DAYS } from '@/lib/shared/dashboard';
import { evaluationProblems } from '@/lib/shared/scoring/evaluation';
import { TEXT_FIELDS } from '@/lib/shared/scoring/text-audit';
import type { AnalysisResult } from '@/lib/shared/types';
import { publicationToApi } from '../publications/to-api';
import { analyzePublications } from './analyze';
import { pickContent, type PublicationForPrompt } from './prompts';
import { calculatePressScore } from './score';

export interface PublicationScope {
  /** Den Re-Score-Pool statt der offenen Kandidaten (überschreibt Bewertetes). */
  forceReanalyze?: boolean;
  /** Genau diese Publikationen, geschnitten mit dem Pool. */
  ids?: string[];
  /** Nur Publikationen mit diesem llm_model (Neubewertung einer Kohorte, impliziert den Pool). */
  rescoreTag?: string;
  /** Nur Publikationen, die seit diesem Zeitpunkt geändert wurden (ISO-Datum). */
  since?: string;
}

/**
 * Der Scope EINES Bewertungslaufs. Zwei Gates, beide unverhandelbar:
 *
 *  1. WAS ist bewertbar: die kanonischen Views (Migration 20260721000001).
 *     Non-force nimmt die offenen Kandidaten (`publication_scoring_candidates`),
 *     force den ganzen Re-Score-Pool (`publication_rescore_pool`: bewertbar,
 *     aber evtl. schon bewertet, also Überschreiben). Force ignoriert also
 *     NICHT jedes Prädikat (bis 2026-07-21 war die force-Bedingung schlicht
 *     `undefined`): archiviert, ITA oder ohne Inhalt bleibt in BEIDEN Fällen
 *     außen vor.
 *  2. WIE ALT darf es sein: `created_at` innerhalb SCORING_RECENT_DAYS. Der
 *     Altbestand gehört dem In-Chat-Pfad (scripts/session-pipeline.ts); `limit`
 *     ist nur ein Sicherheitsdeckel, kein Scope-Instrument.
 *
 * Benannte ids und eine benannte Kohorte (`rescoreTag`) sind selbst der Scope
 * und kommen deshalb ohne Zeitfenster aus: wer eine Publikation vor sich hat,
 * will SIE bewerten, nicht „was neu ist". `since` grenzt über updated_at ein.
 * Exportiert, damit lib/server/analysis/scoring-adapter.test.ts das gerenderte
 * SQL ohne DB prüfen kann.
 */
export function buildAnalysisScopeWhere(scope: PublicationScope): SQL {
  const pool = sql.raw(
    scope.forceReanalyze || scope.rescoreTag ? 'publication_rescore_pool' : 'publication_scoring_candidates',
  );
  const conditions: SQL[] = [sql`${publications.id} IN (SELECT id FROM ${pool})`];
  // Das Array via sql.param()::uuid[] binden; ein bares ${array} scheitert am
  // Supabase-Pooler (Memory drizzle-any-array-prod-bug).
  if (scope.ids?.length) conditions.push(sql`${publications.id} = ANY(${sql.param(scope.ids)}::uuid[])`);
  if (scope.rescoreTag) conditions.push(sql`${publications.llmModel} = ${scope.rescoreTag}`);
  if (scope.since) conditions.push(sql`${publications.updatedAt} >= ${scope.since}::timestamptz`);
  if (!scope.ids?.length && !scope.rescoreTag) {
    conditions.push(
      sql`${publications.createdAt} >= now() - make_interval(days => ${SCORING_RECENT_DAYS}::int)`,
    );
  }
  return sql.join(conditions, sql` AND `);
}

/**
 * Kandidaten samt Instituten für den Prompt. Nach Eingangsdatum, nicht nach
 * Erscheinungsdatum: „zuletzt hereingekommen" ist die Reihenfolge, in der die
 * Redaktion neue Kandidaten erwartet. `skipped` = benannte ids, die an den
 * Bewertbarkeits-Gates hängen blieben; nur der Fetcher kennt die angefragte
 * gegen die gefundene Menge.
 */
export async function fetchPublicationCandidates(
  query: CandidateQuery,
): Promise<{ items: PublicationForPrompt[]; skipped: number }> {
  const rows = await db.query.publications.findMany({
    where: buildAnalysisScopeWhere({
      forceReanalyze: query.force,
      ids: query.ids,
      rescoreTag: query.rescoreTag,
      since: query.since,
    }),
    orderBy: descNullsLast(publications.createdAt),
    // Bei ids zählt die benannte Menge, nicht der Deckel: sonst würde eine
    // Auswahl stillschweigend gekürzt.
    limit: query.ids?.length ?? query.limit,
    with: {
      orgunitPublications: {
        columns: { orgunitId: true },
        with: { orgunit: { columns: { akronymDe: true, nameDe: true } } },
      },
    },
  });

  const items = rows.map((row): PublicationForPrompt => {
    const orgunits = (row.orgunitPublications ?? [])
      .map((op) => op.orgunit)
      .filter((o): o is NonNullable<typeof o> => o !== null)
      .map((o) => ({ akronym_de: o.akronymDe, name_de: o.nameDe }));
    return { ...publicationToApi(row), orgunits };
  });
  return { items, skipped: query.ids ? query.ids.length - items.length : 0 };
}

export const publicationScoringAdapter: ScoringAdapter<PublicationForPrompt, AnalysisResult> = {
  entity: 'publications',
  requiresHaiku: true,
  fetchCandidates: fetchPublicationCandidates,
  analyze: (batch, call) => analyzePublications(batch, call),
  resultIndex: (r) => r.publication_index,
  problemsOf: (r) => evaluationProblems(r, { dimensions: SCORE_DIMENSIONS, texts: TEXT_FIELDS }),
  textsOf: (r) => ({
    pitch_suggestion: r.pitch_suggestion,
    suggested_angle: r.suggested_angle,
    target_audience: r.target_audience,
    reasoning: r.reasoning,
    haiku: r.haiku,
  }),
  withTexts: (r, texts) => ({ ...r, ...texts }),
  contentOf: (pub) => pickContent(pub)?.text ?? pub.title,
  scores: async (results) => results.map(calculatePressScore),
  write: (rows, ctx) =>
    writePublicationEvaluations(
      rows.map((r) => ({ id: r.item.id, result: r.result, haiku: r.haiku, cost: r.cost })),
      ctx,
    ),
  markFailed: markPublicationsFailed,
};
