import { NextRequest, NextResponse } from 'next/server';
import { withApiError } from '@/lib/server/http';
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
export const GET = withApiError(async (req: NextRequest) => {
  // No edge schema by design (ADR 0018 verified-no-op): every param is
  // fully narrowed below — `stats`/`with_pub` via exact `=== 'true'` and
  // `orphans` as an explicit tri-state — so there is no undefined-behaviour
  // vector for a schema to guard.
  const sp = req.nextUrl.searchParams;

  if (sp.get('stats') === 'true') {
    const stats = await getPressReleasesStats();
    return NextResponse.json(stats);
  }

  const orphansParam = sp.get('orphans');
  const result = await listPressReleases({
    orphans:
      orphansParam === 'true' || orphansParam === 'false' ? orphansParam : null,
    withPub: sp.get('with_pub') === 'true',
  });
  return NextResponse.json(result);
});
