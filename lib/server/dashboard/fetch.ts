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
import { countOrphans } from '@/lib/server/press-releases/list';
import {
  DIMENSION_SORT_MAP,
  SIMILARITY_RANGE_MAX,
  SIMILARITY_RANGE_MIN,
  type DashboardPeriod,
  type PeriodCounts,
  type ScoreSimilarityPoint,
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
// the dashboard adds the press-similarity histogram on top.
export type DashboardStats = PublicationDashboardStats & {
  /** Histogram of `press_similarity` in 10 buckets across the meaningful
   *  SPECTER2 band [SIMILARITY_RANGE_MIN, SIMILARITY_RANGE_MAX]. Feeds the
   *  mirror histogram, which lives alongside the joint scatter (the
   *  histogram shows each metric's marginal shape; the scatter shows how
   *  they relate). */
  similarity_distribution: number[];
};

// Press-similarity histogram. 10 equal-width buckets across the meaningful
// SPECTER2-cosine band [SIMILARITY_RANGE_MIN, SIMILARITY_RANGE_MAX]; a full
// [0..1] axis would clump all data against the right edge (live values sit
// in ~0.80-0.95). Any pub with the metric set, no archive/eligibility filter.
async function getSimilarityDistribution(): Promise<number[]> {
  // `width_bucket(value, lo, hi, n)` returns 1..n for in-range, 0 / n+1 for
  // under/overflow. Clamp both edges with GREATEST/LEAST so a future outlier
  // outside the [MIN, MAX] band still lands inside the 10-cell histogram
  // rather than vanishing.
  const rows = await db.execute<{ bucket: number; count: number }>(sql`
    SELECT
      GREATEST(LEAST(width_bucket(press_similarity, ${SIMILARITY_RANGE_MIN}::float8, ${SIMILARITY_RANGE_MAX}::float8, 10), 10), 1) AS bucket,
      count(*)::int AS count
    FROM publications
    WHERE press_similarity IS NOT NULL
    GROUP BY bucket
    ORDER BY bucket
  `);
  const buckets = new Array(10).fill(0) as number[];
  for (const r of rows) {
    const idx = Math.max(0, Math.min(9, r.bucket - 1));
    buckets[idx] += r.count;
  }
  return buckets;
}

/**
 * 2D density bins [press_score, press_similarity, count] over analyzed pubs
 * that have both metrics. Feeds the joint scatter that complements the
 * marginal histograms: the marginals can't show that a low Story Score can
 * coincide with a high Press-Similarity (the LLM-blind-spot cross-check);
 * only the joint view does.
 *
 * Binned server-side rather than shipping every raw point: the scatter is a
 * distribution view, so a fixed grid of populated cells (each carrying a
 * count) conveys the same shape at a fraction of the pooler egress. This
 * query used to return up to 4000 raw rows on EVERY (uncached) dashboard
 * render — under continuous healthcheck/monitor polling that was the single
 * largest egress driver. Bin edges are chosen so the diagnostic-quadrant
 * thresholds (score 40 %, similarity 85 %) land exactly on a cell boundary,
 * so the top-left count the chart reports stays exact.
 */
async function getScoreSimilarityPoints(): Promise<ScoreSimilarityPoint[]> {
  // Score binned at 0.02 (2 %), similarity at 0.01 (1 %). Cell centre =
  // bucket floor + half a bin. At most ~50×30 populated cells (score 0..1 ×
  // similarity ~0.7..1.0) regardless of corpus size, vs. thousands of raw
  // points before.
  const rows = await db.execute<{ s: number; p: number; c: number }>(sql`
    SELECT
      LEAST(floor(press_score / 0.02) * 0.02 + 0.01, 1)::float8 AS s,
      LEAST(floor(press_similarity / 0.01) * 0.01 + 0.005, 1)::float8 AS p,
      count(*)::int AS c
    FROM publications
    WHERE analysis_status = 'analyzed'
      AND press_score IS NOT NULL
      AND press_similarity IS NOT NULL
      AND archived = false
    GROUP BY 1, 2
  `);
  return rows.map((r) => [r.s, r.p, r.c]);
}

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
  const [base, similarityBuckets] = await Promise.all([
    fetchPublicationDashboardStats(defaultEligible),
    getSimilarityDistribution(),
  ]);
  return { ...base, similarity_distribution: similarityBuckets };
}

// Eligible-pub counts for all four dashboard periods in ONE conditional-
// aggregation roundtrip over the canonical `press_eligible_publications`
// view (migration 20260516000002). Period-independent: the SQL function
// always returns all four, so the result is the same regardless of which
// period the page requested. Feeds the „Mehr laden" cross-period hint. The
// cutoffs come from the SAME `publishedAfter()` the list path uses, so
// „month" keeps its deliberate two-month window without re-encoding the
// interval math in SQL. week/month/year never resolve to null (only 'all'
// would, and the 'all' bucket needs no cutoff).
async function getPeriodCounts(): Promise<PeriodCounts> {
  const rows = await db.execute<{ counts: Partial<PeriodCounts> | null }>(
    sql`SELECT publication_period_counts(
      ${publishedAfter('week')}::date,
      ${publishedAfter('month')}::date,
      ${publishedAfter('year')}::date
    ) AS counts`,
  );
  const c = rows[0]?.counts ?? {};
  return {
    week: c.week ?? 0,
    month: c.month ?? 0,
    year: c.year ?? 0,
    all: c.all ?? 0,
  };
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
  /** Eligible-pub counts per period (week/month/year/all). Drives the
   *  „Mehr laden" terminal-state hint: when the current period is
   *  exhausted, the InfoBubble shows how many more a wider period adds. */
  periodCounts: PeriodCounts;
  flaggedCount: number;
  pressReleasedCount: number;
  orphansCount: number;
  /** (press_score, press_similarity, count) density bins for the joint scatter. */
  scoreSimilarityPoints: ScoreSimilarityPoint[];
  /** Most recent publications.synced_at, formatted (Europe/Vienna) — the
   *  date the loaded WebDB snapshot reflects. null when nothing is synced. */
  webdbAsOf: string | null;
}

// The global, slow-changing aggregates are full-table scans / heavy
// aggregations that don't depend on the request params, so cache them for 60s:
// repeated dashboard renders under traffic no longer re-run them every hit.
// (Replaces the inaccurate "60s-cached in PostgreSQL" assumption — a STABLE SQL
// function is per-statement memoization, NOT a cross-request cache.) Per-request
// data (top pubs for the selected period, the live flag/orphan counts) stays
// uncached so it reflects the latest decisions immediately.
const getStatsCached = unstable_cache(getStats, ['dashboard-stats'], { revalidate: 60 });
const getScoreSimilarityPointsCached = unstable_cache(
  getScoreSimilarityPoints,
  ['dashboard-scatter'],
  { revalidate: 60 },
);
const getPeriodCountsCached = unstable_cache(getPeriodCounts, ['dashboard-period-counts'], {
  revalidate: 60,
});
const getWebdbAsOfCached = unstable_cache(getWebdbAsOf, ['dashboard-webdb-asof'], {
  revalidate: 60,
});

// Parallel-fetches all dashboard data sources in one server-side roundtrip
// (single Promise.all) embedded in the initial HTML.
export async function getDashboardData(
  period: DashboardPeriod,
  topPubsLimit: number,
  sortBy: SortBy = 'score',
): Promise<DashboardData> {
  const [
    stats,
    topPubsResult,
    flaggedCount,
    pressReleasedCount,
    orphansCount,
    scoreSimilarityPoints,
    periodCounts,
    webdbAsOf,
  ] = await Promise.all([
    getStatsCached(true),
    getTopPubs(period, topPubsLimit, sortBy),
    publicationsRepo.countWithFlags(),
    publicationsRepo.countPressReleased(),
    countOrphans(),
    getScoreSimilarityPointsCached(),
    getPeriodCountsCached(),
    getWebdbAsOfCached(),
  ]);
  return {
    stats,
    topPubs: topPubsResult.pubs,
    topPubsTotal: topPubsResult.total,
    topPubsLimit,
    periodCounts,
    flaggedCount,
    pressReleasedCount,
    orphansCount,
    scoreSimilarityPoints,
    webdbAsOf,
  };
}
