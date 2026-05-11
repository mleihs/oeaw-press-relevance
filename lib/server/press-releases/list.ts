import { count, desc, gte, isNotNull, isNull, type SQL } from 'drizzle-orm';
import { db, pressReleases as pressReleasesTable } from '@/lib/server/db';
import type { Lang, PressRelease } from '@/lib/shared/types';

export interface PressReleasesStats {
  total: number;
  matched: number;
  orphans: number;
  this_month: number;
  this_year: number;
}

export interface PressReleasesListResult {
  press_releases: PressRelease[];
  total: number;
}

export interface PressReleasesListFilters {
  orphans: 'true' | 'false' | null;
  withPub: boolean;
}

// Explicit Drizzle row -> shared PressRelease DTO. Column renames in the
// schema surface here at compile time (Plan §7.1).
function toApi(row: typeof pressReleasesTable.$inferSelect): PressRelease {
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

/**
 * Five count-only queries in parallel: total, matched (publication_id NOT
 * NULL), orphans (publication_id NULL), this_month (released_at >= start of
 * current month) and this_year (released_at >= January 1 of current year).
 */
export async function getPressReleasesStats(): Promise<PressReleasesStats> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const startOfYear = new Date(now.getFullYear(), 0, 1)
    .toISOString()
    .slice(0, 10);

  const [totalQ, matchedQ, orphansQ, monthQ, yearQ] = await Promise.all([
    db.select({ c: count() }).from(pressReleasesTable),
    db
      .select({ c: count() })
      .from(pressReleasesTable)
      .where(isNotNull(pressReleasesTable.publicationId)),
    db
      .select({ c: count() })
      .from(pressReleasesTable)
      .where(isNull(pressReleasesTable.publicationId)),
    db
      .select({ c: count() })
      .from(pressReleasesTable)
      .where(gte(pressReleasesTable.releasedAt, startOfMonth)),
    db
      .select({ c: count() })
      .from(pressReleasesTable)
      .where(gte(pressReleasesTable.releasedAt, startOfYear)),
  ]);

  return {
    total: totalQ[0]?.c ?? 0,
    matched: matchedQ[0]?.c ?? 0,
    orphans: orphansQ[0]?.c ?? 0,
    this_month: monthQ[0]?.c ?? 0,
    this_year: yearQ[0]?.c ?? 0,
  };
}

/**
 * List press-releases ordered by released_at desc.
 *   - orphans: 'true'  -> only publication_id IS NULL
 *   - orphans: 'false' -> only matched
 *   - orphans: null    -> all
 *   - withPub: true    -> the UI listing page wants lightweight publication
 *     fields joined; handled in a separate code path below (Drizzle relations
 *     API) so the simple list case stays in a single .select().
 */
export async function listPressReleases(
  filters: PressReleasesListFilters,
): Promise<PressReleasesListResult> {
  const filter: SQL | undefined =
    filters.orphans === 'true'
      ? isNull(pressReleasesTable.publicationId)
      : filters.orphans === 'false'
        ? isNotNull(pressReleasesTable.publicationId)
        : undefined;

  if (filters.withPub) {
    // Drizzle relational query: pulls a lightweight publication subset on
    // each matched row. Orphan rows return publication=null.
    const rows = await db.query.pressReleases.findMany({
      where: filter,
      orderBy: desc(pressReleasesTable.releasedAt),
      with: {
        publication: {
          columns: {
            id: true,
            title: true,
            originalTitle: true,
            leadAuthor: true,
            citation: true,
            pressScore: true,
            pressSimilarity: true,
            decision: true,
            publishedAt: true,
          },
        },
      },
    });
    // Cast at the boundary: the embedded `publication` subobject keeps its
    // Drizzle camelCase keys, mirroring the original behaviour where the UI
    // page does its own consumption-side cast to PressReleaseWithPub.
    return {
      press_releases: rows.map((r) => ({
        ...toApi(r),
        publication: r.publication,
      })) as unknown as PressRelease[],
      total: rows.length,
    };
  }

  const rows = filter
    ? await db
        .select()
        .from(pressReleasesTable)
        .where(filter)
        .orderBy(desc(pressReleasesTable.releasedAt))
    : await db
        .select()
        .from(pressReleasesTable)
        .orderBy(desc(pressReleasesTable.releasedAt));

  return {
    press_releases: rows.map(toApi),
    total: rows.length,
  };
}
