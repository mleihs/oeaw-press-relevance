import { NextRequest, NextResponse } from 'next/server';
import { withApiError } from '@/lib/server/http';
import { buildReviewQueue } from '@/lib/server/review/queue';

export const GET = withApiError(async (req: NextRequest) => {
  const result = await buildReviewQueue(new URL(req.url).searchParams);
  return NextResponse.json(result);
});
