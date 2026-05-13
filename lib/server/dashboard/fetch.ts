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
  else if (period === 'month') d.setMonth(d.getMonth() - 1);
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

async function getStats(defaultEligible: boolean): Promise<DashboardStats> {
  const rows = await db.execute<{ stats: StatsPayload | null }>(
    sql`SELECT publication_dashboard_stats(${defaultEligible}) AS stats`,
  );
  const stats = rows[0]?.stats ?? {};
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

async function getTopPubs(period: DashboardPeriod): Promise<PublicationListItem[]> {
  // Top-10 = what should the press team pitch? Pop-Science excluded because
  // those papers are already outreach; ITA subtree excluded because handled
  // by their own communications. `default_eligible=true` filters out theses
  // and posters.
  const params = new URLSearchParams({
    page: '1',
    pageSize: '10',
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
  return res.publications;
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
  topPubs: PublicationListItem[];
  flaggedCount: number;
  pressReleasedCount: number;
  orphansCount: number;
}

// Parallel-fetches all five dashboard data sources. Replaces the legacy
// five separate `useApiQuery` calls in `app/page.tsx` — one server-side
// roundtrip (single Promise.all) embedded in the initial HTML.
export async function getDashboardData(
  period: DashboardPeriod,
): Promise<DashboardData> {
  const [stats, topPubs, flaggedCount, pressReleasedCount, orphansResult] = await Promise.all([
    getStats(true),
    getTopPubs(period),
    countWith(new URLSearchParams({ flagged: 'true' })),
    countWith(new URLSearchParams({ press_released: 'true' })),
    listPressReleases({ orphans: 'true', withPub: false }),
  ]);
  return {
    stats,
    topPubs,
    flaggedCount,
    pressReleasedCount,
    orphansCount: orphansResult.total,
  };
}
