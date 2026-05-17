import { NextRequest, NextResponse } from 'next/server';
import { getResearcherDetail } from '@/lib/server/researchers/detail';
import { apiError, validateParams, validateQuery, withApiError } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { personDetailQuerySchema } from '@/lib/shared/schemas';

export const GET = withApiError(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = validateParams(await params, idParamSchema);
  const { since, exclude_ita, exclude_outreach } = validateQuery(
    req.nextUrl.searchParams,
    personDetailQuerySchema,
  );

  const detail = await getResearcherDetail({
    id,
    since,
    excludeIta: exclude_ita,
    excludeOutreach: exclude_outreach,
  });
  if (!detail) return apiError('person not found', 404);
  return NextResponse.json(detail);
});
