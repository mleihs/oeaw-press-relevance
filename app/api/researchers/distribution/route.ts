import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/server/db';
import { validateQuery, withApiError } from '@/lib/server/http';
import { researchersLeaderboardQuerySchema } from '@/lib/shared/schemas';
import type { DistributionPoint } from '@/lib/shared/researchers';

export const GET = withApiError(async (req: NextRequest) => {
  const q = validateQuery(
    req.nextUrl.searchParams,
    researchersLeaderboardQuerySchema(500),
  );
  const oestat3Ids = q.oestat3_ids;
  // Hard cap stays a clamp (not a reject) exactly as before.
  const limit = Math.min(q.limit, 1000);

  // See researchers/top route for the sql.param + cast rationale.
  const rows = (await db.execute(
    sql`SELECT * FROM researcher_distribution(
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
  )) as unknown as DistributionPoint[];
  // PG `numeric`/`bigint` erreichen JS als String — der TS-Typ verspricht
  // number und der Client ruft .toFixed (Beeswarm crashte bei sum_score).
  // An der API-Boundary koerzieren statt im Client.
  const points = rows.map((r) => ({
    ...r,
    metric_value: Number(r.metric_value),
    pubs_total: Number(r.pubs_total),
    count_high: Number(r.count_high),
  }));
  return NextResponse.json({ points });
});
