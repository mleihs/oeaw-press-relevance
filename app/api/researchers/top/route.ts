import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/server/db';
import { validateQuery, withApiError } from '@/lib/server/http';
import { researchersLeaderboardQuerySchema } from '@/lib/shared/schemas';
import type { TopResearcherRow } from '@/lib/shared/researchers';

export const GET = withApiError(async (req: NextRequest) => {
  const q = validateQuery(
    req.nextUrl.searchParams,
    researchersLeaderboardQuerySchema(50),
  );
  const oestat3Ids = q.oestat3_ids;
  // Hard cap stays a clamp (not a reject) exactly as before.
  const limit = Math.min(q.limit, 200);

  // `sql.param(oestat3Ids)` binds the JS array (or null) as one PG param;
  // plain `${oestat3Ids}` would expand to a comma-separated parenthesised
  // list which the `::text[]` cast can't consume. The `as` cast escapes
  // Drizzle's `execute<TRow extends Record<string, unknown>>` constraint —
  // interfaces don't structurally satisfy that without an index signature.
  const rows = (await db.execute(
    sql`SELECT * FROM top_researchers(
      ${q.since}::date,
      ${q.metric},
      ${q.authorship_scope},
      ${sql.param(oestat3Ids)}::text[],
      ${q.include_external},
      ${q.include_deceased},
      ${q.member_only},
      ${q.min_value}::numeric,
      ${limit}::int,
      ${q.exclude_ita},
      ${q.exclude_outreach}
    )`,
  )) as unknown as TopResearcherRow[];
  // PG `numeric`/`bigint` erreichen JS als String — der TS-Typ verspricht
  // number und die Clients rufen .toFixed (Leaderboard/Podium bei sum_score).
  // An der API-Boundary koerzieren statt in jedem Consumer.
  const coerced = rows.map((r) => ({
    ...r,
    rank_now: Number(r.rank_now),
    delta_count_high: Number(r.delta_count_high),
    count_high: Number(r.count_high),
    sum_score: Number(r.sum_score),
    avg_score: Number(r.avg_score),
    weighted_avg: Number(r.weighted_avg),
    pubs_total: Number(r.pubs_total),
    self_highlight_count: Number(r.self_highlight_count),
  }));
  return NextResponse.json({ rows: coerced });
});
