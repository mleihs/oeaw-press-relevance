import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/server/db';
import { apiError, withApiError } from '@/lib/server/http';
import type {
  AuthorshipScope,
  LeaderboardMetric,
  TopResearcherRow,
} from '@/lib/shared/researchers';

const ALLOWED_METRICS: LeaderboardMetric[] = [
  'count_high', 'sum_score', 'avg_score', 'weighted_avg', 'pubs_total',
];
const ALLOWED_SCOPES: AuthorshipScope[] = ['all', 'lead'];

function csv(s: string | null): string[] | null {
  if (!s) return null;
  const arr = s.split(',').map((x) => x.trim()).filter(Boolean);
  return arr.length ? arr : null;
}

export const GET = withApiError(async (req: NextRequest) => {
  const u = req.nextUrl.searchParams;

  const since = u.get('since');
  if (!since || !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    return apiError('since must be YYYY-MM-DD', 400);
  }

  const metric = (u.get('metric') as LeaderboardMetric) || 'count_high';
  if (!ALLOWED_METRICS.includes(metric)) {
    return apiError(`metric must be one of ${ALLOWED_METRICS.join(', ')}`, 400);
  }

  const scope = (u.get('authorship_scope') as AuthorshipScope) || 'all';
  if (!ALLOWED_SCOPES.includes(scope)) {
    return apiError(`authorship_scope must be one of ${ALLOWED_SCOPES.join(', ')}`, 400);
  }

  const oestat3Ids = csv(u.get('oestat3_ids'));
  const includeExternal = u.get('include_external') === 'true';
  const includeDeceased = u.get('include_deceased') === 'true';
  const memberOnly = u.get('member_only') === 'true';
  const minValue = Number(u.get('min_value') ?? '1');
  const limit = Math.min(Number(u.get('limit') ?? '50'), 200);
  const excludeIta = u.get('exclude_ita') !== 'false';
  const excludeOutreach = u.get('exclude_outreach') !== 'false';

  // `sql.param(oestat3Ids)` binds the JS array (or null) as one PG param;
  // plain `${oestat3Ids}` would expand to a comma-separated parenthesised
  // list which the `::text[]` cast can't consume. The `as` cast escapes
  // Drizzle's `execute<TRow extends Record<string, unknown>>` constraint —
  // interfaces don't structurally satisfy that without an index signature.
  const rows = (await db.execute(
    sql`SELECT * FROM top_researchers(
      ${since}::date,
      ${metric},
      ${scope},
      ${sql.param(oestat3Ids)}::text[],
      ${includeExternal},
      ${includeDeceased},
      ${memberOnly},
      ${minValue}::numeric,
      ${limit}::int,
      ${excludeIta},
      ${excludeOutreach}
    )`,
  )) as unknown as TopResearcherRow[];
  return NextResponse.json({ rows });
});
