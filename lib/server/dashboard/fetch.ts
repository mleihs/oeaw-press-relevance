import { desc, isNotNull, sql } from 'drizzle-orm';
import { db, publications } from '@/lib/server/db';
import {
  listPublications,
  type PublicationListItem,
} from '@/lib/server/publications/list';
import { publicationsRepo } from '@/lib/server/repos/publications';
import { listPressReleases } from '@/lib/server/press-releases/list';
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

// JSONB payload shape returned by the `publication_dashboard_stats(...)`
// SQL function (supabase/migrations/20260505000002). All fields optional —
// the SQL function builds the object conditionally and this wrapper fills
// in defaults at the boundary.
type StatsPayload = {
  total?: number;
  enriched?: number;
  partial?: number;
  with_abstract?: number;
  analyzed?: number;
  peer_reviewed?: number;
  popular_science?: number;
  bilingual_summary?: number;
  avg_score?: number | null;
  high_score_count?: number;
  score_distribution?: number[];
  dimension_avgs?: Record<string, number>;
  top_keywords?: { word: string; count: number }[];
};

export type DashboardStats = {
  total: number;
  enriched: number;
  partial: number;
  with_abstract: number;
  analyzed: number;
  peer_reviewed: number;
  popular_science: number;
  bilingual_summary: number;
  avg_score: number | null;
  high_score_count: number;
  score_distribution: number[];
  /** Histogram of `press_similarity` in 10 buckets across the meaningful
   *  SPECTER2 band [SIMILARITY_RANGE_MIN, SIMILARITY_RANGE_MAX]. Feeds the
   *  mirror histogram, which lives alongside the joint scatter (the
   *  histogram shows each metric's marginal shape; the scatter shows how
   *  they relate). */
  similarity_distribution: number[];
  dimension_avgs: Record<string, number>;
  top_keywords: { word: string; count: number }[];
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
 * One [press_score, press_similarity] pair per analyzed pub that has both
 * metrics. Feeds the joint scatter that complements the marginal
 * histograms: the marginals can't show that a low Story Score can coincide
 * with a high Press-Similarity (the LLM-blind-spot cross-check); only the
 * joint view does. Values rounded server-side (s: 3dp, p: 4dp) to keep the
 * embedded RSC payload lean; identity is intentionally omitted (distribution
 * view, not a row list).
 */
async function getScoreSimilarityPoints(): Promise<ScoreSimilarityPoint[]> {
  const rows = await db.execute<{ s: number; p: number }>(sql`
    SELECT round(press_score::numeric, 3)::float8 AS s,
           round(press_similarity::numeric, 4)::float8 AS p
    FROM publications
    WHERE analysis_status = 'analyzed'
      AND press_score IS NOT NULL
      AND press_similarity IS NOT NULL
      AND archived = false
  `);
  return rows.map((r) => [r.s, r.p]);
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
  const [statsRows, similarityBuckets] = await Promise.all([
    db.execute<{ stats: StatsPayload | null }>(
      sql`SELECT publication_dashboard_stats(${defaultEligible}) AS stats`,
    ),
    getSimilarityDistribution(),
  ]);
  const stats = statsRows[0]?.stats ?? {};
  return {
    total: stats.total || 0,
    enriched: stats.enriched || 0,
    partial: stats.partial || 0,
    with_abstract: stats.with_abstract || 0,
    analyzed: stats.analyzed || 0,
    peer_reviewed: stats.peer_reviewed || 0,
    popular_science: stats.popular_science || 0,
    bilingual_summary: stats.bilingual_summary || 0,
    avg_score: stats.avg_score ?? null,
    high_score_count: stats.high_score_count || 0,
    score_distribution: stats.score_distribution ?? new Array(10).fill(0),
    similarity_distribution: similarityBuckets,
    dimension_avgs: stats.dimension_avgs ?? {},
    top_keywords: stats.top_keywords ?? [],
  };
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
  /** (press_score, press_similarity) pairs for the joint scatter. */
  scoreSimilarityPoints: ScoreSimilarityPoint[];
  /** Most recent publications.synced_at, formatted (Europe/Vienna) — the
   *  date the loaded WebDB snapshot reflects. null when nothing is synced. */
  webdbAsOf: string | null;
}

// Parallel-fetches all five dashboard data sources. Replaces the legacy
// five separate `useApiQuery` calls in `app/page.tsx` — one server-side
// roundtrip (single Promise.all) embedded in the initial HTML.
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
    orphansResult,
    scoreSimilarityPoints,
    periodCounts,
    webdbAsOf,
  ] = await Promise.all([
    getStats(true),
    getTopPubs(period, topPubsLimit, sortBy),
    publicationsRepo.countWithFlags(),
    publicationsRepo.countPressReleased(),
    listPressReleases({ orphans: 'true', withPub: false }),
    getScoreSimilarityPoints(),
    getPeriodCounts(),
    getWebdbAsOf(),
  ]);
  return {
    stats,
    topPubs: topPubsResult.pubs,
    topPubsTotal: topPubsResult.total,
    topPubsLimit,
    periodCounts,
    flaggedCount,
    pressReleasedCount,
    orphansCount: orphansResult.total,
    scoreSimilarityPoints,
    webdbAsOf,
  };
}
