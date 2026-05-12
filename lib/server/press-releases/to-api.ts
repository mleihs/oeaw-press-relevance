import { pressReleases as pressReleasesTable } from '@/lib/server/db';
import type { Lang, PressRelease } from '@/lib/shared/types';

/**
 * Entity-owned mapper: Drizzle camelCase row → snake_case + ISO-8601 wire DTO.
 * Lives here (not in `publications/to-api.ts`) so the press-releases feature
 * owns its own wire-shape per ADR 0003. Consumers:
 *
 * - `press-releases/list.ts`  (this feature's own list/stats route)
 * - `publications/list.ts`    (embeds the latest press_release per pub)
 * - `publications/fetch.ts`   (embeds press_releases on the detail wire-shape)
 *
 * A column rename on the press_releases table surfaces here at compile time
 * (Plan §7.1).
 */
export function pressReleaseToApi(
  row: typeof pressReleasesTable.$inferSelect,
): PressRelease {
  return {
    id: row.id,
    publication_id: row.publicationId,
    doi: row.doi,
    url: row.url,
    released_at: row.releasedAt,
    lang: row.lang as Lang | null,
    paper_title: row.paperTitle,
    news_title: row.newsTitle,
    source_news_uid: row.sourceNewsUid,
    abstract: row.abstract,
    authors: row.authors,
    journal: row.journal,
    paper_year: row.paperYear,
    keywords: row.keywords,
    openalex_id: row.openalexId,
    enrichment_status: row.enrichmentStatus as PressRelease['enrichment_status'],
    enriched_at: row.enrichedAt ? new Date(row.enrichedAt).toISOString() : null,
    created_at: new Date(row.createdAt).toISOString(),
    oeaw_author_matches:
      (row.oeawAuthorMatches as PressRelease['oeaw_author_matches']) ?? [],
  };
}
