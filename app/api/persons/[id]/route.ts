import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRequest } from '@/lib/api-helpers';
import type { ResearcherDetail } from '@/lib/researchers';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'invalid person id' }, { status: 400 });
  }

  const u = req.nextUrl.searchParams;
  const since = u.get('since');
  if (!since || !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    return NextResponse.json({ error: 'since must be YYYY-MM-DD' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseFromRequest(req);
    const { data, error } = await supabase.rpc('researcher_detail', {
      p_person_id: id,
      p_since: since,
      p_exclude_ita: u.get('exclude_ita') !== 'false',
      p_exclude_outreach: u.get('exclude_outreach') !== 'false',
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const row = Array.isArray(data) && data.length > 0 ? (data[0] as ResearcherDetail) : null;
    if (!row || !row.person) {
      return NextResponse.json({ error: 'person not found' }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
