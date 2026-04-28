import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRequest } from '@/lib/api-helpers';
import type {
  AuthorshipScope,
  LeaderboardMetric,
  TopResearcherRow,
} from '@/lib/researchers';

const ALLOWED_METRICS: LeaderboardMetric[] = ['count_high', 'sum_score', 'avg_score', 'weighted_avg', 'pubs_total'];
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
    return NextResponse.json({ error: 'since must be YYYY-MM-DD' }, { status: 400 });
  }

  const metric = (u.get('metric') as LeaderboardMetric) || 'count_high';
  if (!ALLOWED_METRICS.includes(metric)) {
    return NextResponse.json({ error: `metric must be one of ${ALLOWED_METRICS.join(', ')}` }, { status: 400 });
  }

  const scope = (u.get('authorship_scope') as AuthorshipScope) || 'all';
  if (!ALLOWED_SCOPES.includes(scope)) {
    return NextResponse.json({ error: `authorship_scope must be one of ${ALLOWED_SCOPES.join(', ')}` }, { status: 400 });
  }

  const params = {
    p_since: since,
    p_metric: metric,
    p_authorship_scope: scope,
    p_oestat3_ids: csv(u.get('oestat3_ids')),
    p_include_external: u.get('include_external') === 'true',
    p_include_deceased: u.get('include_deceased') === 'true',
    p_member_only: u.get('member_only') === 'true',
    p_min_value: Number(u.get('min_value') ?? '1'),
    p_limit: Math.min(Number(u.get('limit') ?? '50'), 200),
    p_exclude_ita: u.get('exclude_ita') !== 'false',
    p_exclude_outreach: u.get('exclude_outreach') !== 'false',
  };

  try {
    const supabase = getSupabaseFromRequest(req);
    const { data, error } = await supabase.rpc('top_researchers', params);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ rows: (data ?? []) as TopResearcherRow[] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
