import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/server/db';
import { validateQuery, withApiError } from '@/lib/server/http';
import { publicationsStatsQuerySchema } from '@/lib/shared/schemas';

// Stats-Endpoint für das Dashboard. Aus /api/publications ausgegliedert,
// damit `revalidate = 60` greift und Vercel die Antwort 60s am Edge cached.
// Vorher (im /api/publications-Branch) hat Vercel den Cache-Control-Header
// ignoriert, weil der Browser bei eingeloggtem Gate `Cookie:` mitschickt.
// Diese Route hat keine Auth-Logik und ist Cookie-unabhängig — Cache wirkt.
export const revalidate = 60;

// JSONB payload shape returned by `publication_dashboard_stats(...)` (see
// supabase/migrations/20260505000002). All fields optional because the SQL
// function builds the object conditionally and the route fills in defaults
// at the wire boundary.
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

export const GET = withApiError(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const { default_eligible: defaultEligible } = validateQuery(
    searchParams,
    publicationsStatsQuerySchema,
  );

  const rows = await db.execute<{ stats: StatsPayload | null }>(
    sql`SELECT publication_dashboard_stats(${defaultEligible}) AS stats`,
  );
  const stats = rows[0]?.stats ?? {};

  return NextResponse.json({
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
  });
});
