import { NextRequest, NextResponse } from 'next/server';
import { apiError, getSupabaseFromRequest } from '@/lib/api-helpers';
import { buildReviewQueue } from '@/lib/server/review/queue';

export async function GET(req: NextRequest) {
  try {
    const result = await buildReviewQueue(
      new URL(req.url).searchParams,
      getSupabaseFromRequest(req),
    );
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
