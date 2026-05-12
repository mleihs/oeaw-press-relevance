import { NextRequest, NextResponse } from 'next/server';
import { getResearcherDetail } from '@/lib/server/researchers/detail';
import { apiError } from '@/lib/server/http';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return apiError('invalid person id', 400);
  }

  const u = req.nextUrl.searchParams;
  const since = u.get('since');
  if (!since || !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    return apiError('since must be YYYY-MM-DD', 400);
  }

  const excludeIta = u.get('exclude_ita') !== 'false';
  const excludeOutreach = u.get('exclude_outreach') !== 'false';

  try {
    const detail = await getResearcherDetail({
      id,
      since,
      excludeIta,
      excludeOutreach,
    });
    if (!detail) return apiError('person not found', 404);
    return NextResponse.json(detail);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
