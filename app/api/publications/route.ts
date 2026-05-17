import { NextRequest, NextResponse } from 'next/server';
import { validateQuery, withApiError } from '@/lib/server/http';
import { publicationsListQuerySchema } from '@/lib/shared/schemas';
import { listPublications } from '@/lib/server/publications/list';

export const GET = withApiError(async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  // Edge-assert only the params with an undefined-behaviour vector
  // (page/pageSize -> NaN offset -> 500). listPublications keeps its own
  // tested, defensive parsing for the ~35-param filter set; the schema is
  // `.loose()` so no valid filter combination can regress to a 400.
  validateQuery(searchParams, publicationsListQuerySchema);
  const result = await listPublications(searchParams);
  return NextResponse.json(result);
});
