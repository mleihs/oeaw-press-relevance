import { NextRequest, NextResponse } from 'next/server';
import { validateQuery, withApiError } from '@/lib/server/http';
import { reviewQueueQuerySchema } from '@/lib/shared/schemas';
import { buildReviewQueue } from '@/lib/server/review/queue';

export const GET = withApiError(async (req: NextRequest) => {
  const searchParams = new URL(req.url).searchParams;
  // Thin contract guard: buildReviewQueue already narrows `decision`
  // (isDecision) and `sort` (only 'combined' is special), so this routes
  // input through the shared helper for consistency without tightening.
  validateQuery(searchParams, reviewQueueQuerySchema);
  const result = await buildReviewQueue(searchParams);
  return NextResponse.json(result);
});
