import { NextRequest, NextResponse } from 'next/server';
import { apiError, getSupabaseFromRequest } from '@/lib/api-helpers';
import type { PressRelease } from '@/lib/types';

/**
 * Press-releases endpoint.
 *
 * Query params:
 *   ?orphans=true   only press-releases without a publications-match (publication_id IS NULL)
 *   ?orphans=false  only matched (publication_id IS NOT NULL)
 *   (none)          all press-releases
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseFromRequest(req);
    const orphans = req.nextUrl.searchParams.get('orphans');

    let q = supabase
      .from('press_releases')
      .select('*', { count: 'exact' })
      .order('released_at', { ascending: false, nullsFirst: false });

    if (orphans === 'true') q = q.is('publication_id', null);
    else if (orphans === 'false') q = q.not('publication_id', 'is', null);

    const { data, error, count } = await q;
    if (error) return apiError(error.message, 500);

    return NextResponse.json({
      press_releases: (data ?? []) as PressRelease[],
      total: count ?? 0,
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
