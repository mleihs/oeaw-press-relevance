import { sql } from 'drizzle-orm';
import { db } from '@/lib/server/db';
import {
  listPublications,
  type PublicationListItem,
} from '@/lib/server/publications/list';
import { listPressReleases } from '@/lib/server/press-releases/list';
import type { DashboardPeriod } from '@/lib/shared/dashboard';

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
  /** Histogram of `press_similarity` in 10 buckets (0.0–1.0, last bucket
   *  inclusive of 1.0). Same eligibility filter as score_distribution. */
  similarity_distribution: number[];
  dimension_avgs: Record<string, number>;
  top_keywords: { word: string; count: number }[];
};

// Press-similarity histogram. Mirrors the shape of `score_distribution` (10
// equal-width buckets across 0..1) and matches its scope: any pub with the
// metric set, no archive/eligibility filter — the existing score_stats SQL
// function chose the same scope so the two histograms render against
// comparable universes.
async function getSimilarityDistribution(): Promise<number[]> {
  // `width_bucket(value, lo, hi, n)` returns 1..n for in-range values and 0 /
  // n+1 for under/overflow. We clamp the overflow bucket (1.0 exactly) into
  // bucket 10 with LEAST so the histogram has 10 cells, indices 0..9.
  const rows = await db.execute<{ bucket: number; count: number }>(sql`
    SELECT
      LEAST(width_bucket(press_similarity, 0::float8, 1::float8, 10), 10) AS bucket,
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

async function getTopPubs(
  period: DashboardPeriod,
  limit: number,
): Promise<{ pubs: PublicationListItem[]; total: number }> {
  // What should the press team pitch? Pop-Science excluded because those
  // papers are already outreach; ITA subtree excluded because handled by
  // their own communications. `default_eligible=true` filters out theses
  // and posters. `limit` is page-size, set by the caller — default 20 with
  // a "Mehr laden" UI lifting it in 20-row chunks.
  const params = new URLSearchParams({
    page: '1',
    pageSize: String(limit),
    sort: 'press_score',
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

// Count helper: piggybacks on listPublications with pageSize=1 so the filter
// translation stays in one place. Fetches a single row but only consumes the
// `total`. The wasted row is ~1KB; the alternative is duplicating
// pre-fetch+JOIN logic from list.ts, which is the bigger maintenance hit.
async function countWith(params: URLSearchParams): Promise<number> {
  params.set('page', '1');
  params.set('pageSize', '1');
  const res = await listPublications(params);
  return res.total;
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
  pressReleasedCount: number;
  orphansCount: number;
}

// Parallel-fetches all five dashboard data sources. Replaces the legacy
// five separate `useApiQuery` calls in `app/page.tsx` — one server-side
// roundtrip (single Promise.all) embedded in the initial HTML.
export async function getDashboardData(
  period: DashboardPeriod,
  topPubsLimit: number,
): Promise<DashboardData> {
  const [stats, topPubsResult, flaggedCount, pressReleasedCount, orphansResult] = await Promise.all([
    getStats(true),
    getTopPubs(period, topPubsLimit),
    countWith(new URLSearchParams({ flagged: 'true' })),
    countWith(new URLSearchParams({ press_released: 'true' })),
    listPressReleases({ orphans: 'true', withPub: false }),
  ]);
  return {
    stats,
    topPubs: topPubsResult.pubs,
    topPubsTotal: topPubsResult.total,
    topPubsLimit,
    flaggedCount,
    pressReleasedCount,
    orphansCount: orphansResult.total,
  };
}
