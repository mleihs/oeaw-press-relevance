import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/server/db';

// JSONB payload shape returned by the `publication_dashboard_stats(...)` SQL
// function (supabase/migrations/20260505000002). All fields optional — the SQL
// function builds the object conditionally; the mapper below fills defaults at
// the boundary.
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

/**
 * The publication dashboard stats with all defaults applied. Shared by the
 * cache-friendly `/api/publications/stats` endpoint and the server-rendered
 * dashboard fetch (which augments it with a press-similarity histogram).
 */
export type PublicationDashboardStats = {
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

/** Runs the `publication_dashboard_stats(...)` SQL function and maps its
 *  conditional JSONB payload onto the fully-defaulted stats object. */
export async function fetchPublicationDashboardStats(
  defaultEligible: boolean,
): Promise<PublicationDashboardStats> {
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
