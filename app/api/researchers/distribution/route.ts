import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/server/db';
import { apiError } from '@/lib/server/http';
import type {
  AuthorshipScope,
  DistributionPoint,
  LeaderboardMetric,
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

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams;

  const since = u.get('since');
  if (!since || !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    return apiError('since must be YYYY-MM-DD', 400);
  }

  const metric = (u.get('metric') as LeaderboardMetric) || 'count_high';
  if (!ALLOWED_METRICS.includes(metric)) {
    return apiError('invalid metric', 400);
  }
  const scope = (u.get('authorship_scope') as AuthorshipScope) || 'all';
  if (!ALLOWED_SCOPES.includes(scope)) {
    return apiError('invalid authorship_scope', 400);
  }

  const oestat3Ids = csv(u.get('oestat3_ids'));
  const includeExternal = u.get('include_external') === 'true';
  const includeDeceased = u.get('include_deceased') === 'true';
  const memberOnly = u.get('member_only') === 'true';
  const minValue = Number(u.get('min_value') ?? '1');
  const limit = Math.min(Number(u.get('limit') ?? '500'), 1000);
  const excludeIta = u.get('exclude_ita') !== 'false';
  const excludeOutreach = u.get('exclude_outreach') !== 'false';

  try {
    // See researchers/top route for the sql.param + cast rationale.
    const points = (await db.execute(
      sql`SELECT * FROM researcher_distribution(
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
    )) as unknown as DistributionPoint[];
    return NextResponse.json({ points });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
