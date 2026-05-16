import { sql } from 'drizzle-orm';
import { db } from '@/lib/server/db';
import {
  listPublications,
  type PublicationListItem,
} from '@/lib/server/publications/list';
import { publicationsRepo } from '@/lib/server/repos/publications';
import { listPressReleases } from '@/lib/server/press-releases/list';
import {
  DIMENSION_SORT_MAP,
  type DashboardPeriod,
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
  dimension_avgs: Record<string, number>;
  top_keywords: { word: string; count: number }[];
};

/**
 * One [press_score, press_similarity] pair per analyzed pub that has both
 * metrics. Feeds the joint scatter that replaced the two marginal
 * histograms: the marginals could never show that a low Story Score can
 * coincide with a high Press-Similarity (the LLM-blind-spot cross-check);
 * only the joint view does. Values rounded server-side (s: 3dp, p: 4dp) to
 * keep the embedded RSC payload lean; identity is intentionally omitted
 * (this is a distribution view, not a row list, same as the old chart).
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

async function getStats(defaultEligible: boolean): Promise<DashboardStats> {
  const statsRows = await db.execute<{ stats: StatsPayload | null }>(
    sql`SELECT publication_dashboard_stats(${defaultEligible}) AS stats`,
  );
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
    dimension_avgs: stats.dimension_avgs ?? {},
    top_keywords: stats.top_keywords ?? [],
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
  flaggedCount: number;
  pressReleasedCount: number;
  orphansCount: number;
  /** (press_score, press_similarity) pairs for the joint scatter. */
  scoreSimilarityPoints: ScoreSimilarityPoint[];
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
  ] = await Promise.all([
    getStats(true),
    getTopPubs(period, topPubsLimit, sortBy),
    publicationsRepo.countWithFlags(),
    publicationsRepo.countPressReleased(),
    listPressReleases({ orphans: 'true', withPub: false }),
    getScoreSimilarityPoints(),
  ]);
  return {
    stats,
    topPubs: topPubsResult.pubs,
    topPubsTotal: topPubsResult.total,
    topPubsLimit,
    flaggedCount,
    pressReleasedCount,
    orphansCount: orphansResult.total,
    scoreSimilarityPoints,
  };
}
