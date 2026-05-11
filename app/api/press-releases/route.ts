import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRequest } from '@/lib/server/db';
import { apiError } from '@/lib/server/http';
import {
  getPressReleasesStats,
  listPressReleases,
} from '@/lib/server/press-releases/list';

/**
 * Query params:
 *   ?stats=true     count-only mode (returns PressReleasesStats)
 *   ?orphans=true   only press-releases without a publication match
 *   ?orphans=false  only matched
 *   ?with_pub=true  joins lightweight publication fields for listing page
 *   (none)          all press-releases
 */
export async function GET(req: NextRequest) {
  try {
    const db = getSupabaseFromRequest(req);
    const sp = req.nextUrl.searchParams;

    if (sp.get('stats') === 'true') {
      const stats = await getPressReleasesStats(db);
      return NextResponse.json(stats);
    }

    const orphansParam = sp.get('orphans');
    const result = await listPressReleases(
      {
        orphans:
          orphansParam === 'true' || orphansParam === 'false' ? orphansParam : null,
        withPub: sp.get('with_pub') === 'true',
      },
      db,
    );
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
