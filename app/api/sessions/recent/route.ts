import { NextRequest, NextResponse } from 'next/server';
import { withApiError } from '@/lib/server/http';
import { getRecentFinishedSession } from '@/lib/server/sessions/lifecycle';

export const GET = withApiError(async (_req: NextRequest) => {
  const recent = await getRecentFinishedSession();
  return NextResponse.json({ recent });
});
