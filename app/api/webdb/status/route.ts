import { NextRequest, NextResponse } from 'next/server';
import { withApiError } from '@/lib/server/http';
import { getWebdbStatus } from '@/lib/server/webdb/status';

export const GET = withApiError(async (_req: NextRequest) => {
  return NextResponse.json(await getWebdbStatus());
});
