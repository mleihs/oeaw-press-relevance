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
  return NextResponse.json({ rows });
});
