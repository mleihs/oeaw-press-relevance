import 'server-only';
import { eq } from 'drizzle-orm';
import {
  db,
  publications as publicationsTable,
  descNullsLast,
} from '@/lib/server/db';
import { LIST_COLUMN_EXCLUDE } from '@/lib/server/repos/publications';

/**
 * Projects only the columns the CSV export uses, ordered by press_score with
 * NULLS LAST so analysed pubs with no score still land at the bottom. When
 * `onlyAnalyzed` is set, restrict to `analysis_status = 'analyzed'`.
 *
 * `authors` / `institute` are intentionally absent — they're not columns on the
 * publications table; the route emits empty cells for them (the historical
 * Supabase-JS `select('*')` returned undefined there).
 */
export function fetchAnalyzedExportRows(onlyAnalyzed: boolean) {
  return db
    .select({
      title: publicationsTable.title,
      doi: publicationsTable.doi,
      published_at: publicationsTable.publishedAt,
      publication_type: publicationsTable.publicationType,
      press_score: publicationsTable.pressScore,
      public_accessibility: publicationsTable.publicAccessibility,
      societal_relevance: publicationsTable.societalRelevance,
      novelty_factor: publicationsTable.noveltyFactor,
      storytelling_potential: publicationsTable.storytellingPotential,
      media_timeliness: publicationsTable.mediaTimeliness,
      pitch_suggestion: publicationsTable.pitchSuggestion,
      target_audience: publicationsTable.targetAudience,
      suggested_angle: publicationsTable.suggestedAngle,
      reasoning: publicationsTable.reasoning,
      llm_model: publicationsTable.llmModel,
      enriched_journal: publicationsTable.enrichedJournal,
      open_access: publicationsTable.openAccess,
    })
    .from(publicationsTable)
    .where(
      onlyAnalyzed
        ? eq(publicationsTable.analysisStatus, 'analyzed')
        : undefined,
    )
    .orderBy(descNullsLast(publicationsTable.pressScore));
}

/**
 * Zeilen für den JSON-Export (`/api/export/json`): der volle Publication-
 * Wire-Shape MINUS der schweren Citation-Blobs (LIST_COLUMN_EXCLUDE: ris,
 * bibtex, endnote, citationApa, fullTextSnippet). Vorher zog ein nacktes
 * `db.select()` diese Blobs für bis zu ~39k Zeilen in den RAM — OOM-Risiko
 * auf der VPS und ein sicherer Cloudflare-100s-Abriss. Die Route füllt die
 * fehlenden Spalten mit null auf, damit `publicationToApi` denselben
 * DTO-Shape liefert wie bisher (Keys bleiben, Inhalte der Blobs entfallen).
 */
export function fetchJsonExportRows(onlyAnalyzed: boolean) {
  return db.query.publications.findMany({
    columns: LIST_COLUMN_EXCLUDE,
    where: onlyAnalyzed
      ? eq(publicationsTable.analysisStatus, 'analyzed')
      : undefined,
    orderBy: descNullsLast(publicationsTable.pressScore),
  });
}
