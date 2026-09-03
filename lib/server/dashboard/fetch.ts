import { unstable_cache } from 'next/cache';
import { desc, isNotNull, sql } from 'drizzle-orm';
import { db, publications } from '@/lib/server/db';
import {
  listPublications,
  type PublicationListItem,
} from '@/lib/server/publications/list';
import { publicationsRepo } from '@/lib/server/repos/publications';
import {
  fetchPublicationDashboardStats,
  type PublicationDashboardStats,
} from '@/lib/server/publications/dashboard-stats';
import { getLastImportDrift, type ImportDrift } from '@/lib/server/ingest/drift';
import {
  DIMENSION_SORT_MAP,
  type DashboardPeriod,
  type SortBy,
} from '@/lib/shared/dashboard';

function publishedAfter(period: DashboardPeriod): string | null {
  if (period === 'all') return null;
  const d = new Date();
  if (period === 'week') d.setDate(d.getDate() - 7);
  // The 'month' bucket is the default dashboard period and intentionally
  // covers the trailing two months — the analyzed pool in a single calendar
  // month is typically too thin (single digits) to fill the Top-N panel.
  else if (period === 'month') d.setMonth(d.getMonth() - 2);
  else if (period === 'year') d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

// The base stats (fetch + defaulting) are shared with /api/publications/stats;
// the dashboard only overrides `analyzed` (see getStats). Die frühere
// similarity_distribution (width_bucket-Full-Scan) wurde 2026-08-31 entfernt:
// weder DashboardClient noch ein anderer Konsument hat sie je gerendert.
export type DashboardStats = PublicationDashboardStats;

// Most recent publications.synced_at — webdb-import stamps every upserted
// row with NOW(), so the latest value is the date the loaded data reflects
// ("WebDB-Stand"). Formatted server-side in Europe/Vienna so the client
// renders a plain string with no Date() parse — no SSR/client timezone
// split near midnight. Same source as app/api/webdb/status.
async function getWebdbAsOf(): Promise<string | null> {
  const rows = await db
    .select({ syncedAt: publications.syncedAt })
    .from(publications)
    .where(isNotNull(publications.syncedAt))
    .orderBy(desc(publications.syncedAt))
    .limit(1);
  const raw = rows[0]?.syncedAt;
  if (!raw) return null;
  return new Date(raw).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Vienna',
  });
}

async function getStats(defaultEligible: boolean): Promise<DashboardStats> {
  const [base, eligibleRows] = await Promise.all([
    fetchPublicationDashboardStats(defaultEligible),
    // „analysiert"-Kachel auf die KANONISCHE press_eligible_publications-Sicht
    // angleichen — dieselbe Zahl wie der Titelscreen und Publikationen. Der rohe
    // `analyzed` aus publication_dashboard_stats zählt ITA-Subtree + Pop-Science
    // mit und wich daher ab (Titelscreen 7.444 vs. Dashboard 7.9xx). Nur die
    // Kachel „N analysiert · X % des Bestands" nutzt stats.analyzed.
    db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM press_eligible_publications`),
  ]);
  const analyzed = eligibleRows[0]?.n ?? base.analyzed;
  return { ...base, analyzed };
}

async function getTopPubs(
  period: DashboardPeriod,
  limit: number,
  sortBy: SortBy,
): Promise<{ pubs: PublicationListItem[]; total: number }> {
  // What should the press team pitch? Pop-Science excluded because those
  // papers are already outreach; ITA subtree excluded because handled by
  // their own communications. `default_eligible=true` filters out theses
  // and posters. `limit` is page-size, set by the caller — default 20 with
  // a "Mehr laden" UI lifting it in 20-row chunks.
  // The radar's click-to-sort overrides the default press_score order with
  // one of the five raw LLM dimensions; the translation table lives in
  // lib/shared/dashboard so the URL key and DB column name stay aligned.
  const sortColumn = sortBy === 'score' ? 'press_score' : DIMENSION_SORT_MAP[sortBy];
  const params = new URLSearchParams({
    page: '1',
    pageSize: String(limit),
    sort: sortColumn,
    order: 'desc',
    analysis_status: 'analyzed',
    default_eligible: 'true',
    exclude_ita: 'true',
    popular_science: 'false',
  });
  const after = publishedAfter(period);
  if (after) params.set('published_after', after);
  const res = await listPublications(params);
  return { pubs: res.publications, total: res.total };
}

export interface DashboardData {
  stats: DashboardStats;
  /** Top press-score pubs in the current period, bounded by `topPubsLimit`. */
  topPubs: PublicationListItem[];
  /** Total matching pubs in the period — used by the UI to decide whether
   *  to render a „Mehr laden" link below the list. */
  topPubsTotal: number;
  /** The effective page-size that the caller resolved (default 20). Round-
   *  trips back to the client so the "Mehr laden" link knows what to add. */
  topPubsLimit: number;
  flaggedCount: number;
  /** Most recent publications.synced_at, formatted (Europe/Vienna) — the
   *  date the loaded WebDB snapshot reflects. null when nothing is synced. */
  webdbAsOf: string | null;
  /** Drift-Belege des letzten Nacht-Imports; null, wenn der Lauf sauber war. */
  importDrift: ImportDrift | null;
}

// The global, slow-changing aggregates are full-table scans / heavy
// aggregations that don't depend on the request params, so cache them for 60s:
// repeated dashboard renders under traffic no longer re-run them every hit.
// (Replaces the inaccurate "60s-cached in PostgreSQL" assumption — a STABLE SQL
// function is per-statement memoization, NOT a cross-request cache.) Per-request
// data (top pubs for the selected period, the live flag/orphan counts) stays
// uncached so it reflects the latest decisions immediately.
const getStatsCached = unstable_cache(getStats, ['dashboard-stats'], { revalidate: 60 });
const getWebdbAsOfCached = unstable_cache(getWebdbAsOf, ['dashboard-webdb-asof'], {
  revalidate: 60,
});
// Aendert sich hoechstens einmal pro Nacht -- derselbe 60-s-Deckel wie die
// uebrigen langsamen Aggregate reicht voellig.
const getLastImportDriftCached = unstable_cache(getLastImportDrift, ['dashboard-import-drift'], {
  revalidate: 60,
});

// Parallel-fetches all dashboard data sources in one server-side roundtrip
// (single Promise.all) embedded in the initial HTML.
export async function getDashboardData(
  period: DashboardPeriod,
  topPubsLimit: number,
  sortBy: SortBy = 'score',
): Promise<DashboardData> {
  // 2026-08-31 gestrichen: scoreSimilarityPoints, periodCounts, similarity_
  // distribution, orphansCount und pressReleasedCount wurden von keinem
  // Konsumenten mehr gelesen (DashboardClient destrukturiert nur die Felder
  // unten) — ihre Full-Table-Scans liefen trotzdem bei jedem Cache-Miss mit.
  const [stats, topPubsResult, flaggedCount, webdbAsOf, importDrift] =
    await Promise.all([
      getStatsCached(true),
      getTopPubs(period, topPubsLimit, sortBy),
      publicationsRepo.countWithFlags(),
      getWebdbAsOfCached(),
      getLastImportDriftCached(),
    ]);
  return {
    stats,
    topPubs: topPubsResult.pubs,
    topPubsTotal: topPubsResult.total,
    topPubsLimit,
    flaggedCount,
    webdbAsOf,
    importDrift,
  };
}
