import { NextRequest, NextResponse } from 'next/server';
import { withApiError } from '@/lib/server/http';
import { buildReviewQueue } from '@/lib/server/review/queue';

export const GET = withApiError(async (req: NextRequest) => {
  // No edge schema by design (ADR 0018 verified-no-op): buildReviewQueue
  // guards `decision` (isDecision -> falls back to 'undecided') and treats
  // only `sort === 'combined'` specially, so there is no
  // undefined-behaviour vector for a schema to guard.
  const result = await buildReviewQueue(new URL(req.url).searchParams);
  return NextResponse.json(result);
});
