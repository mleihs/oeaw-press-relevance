import { NextRequest, NextResponse } from 'next/server';
import { withApiError } from '@/lib/server/http';
import { listOrgunits } from '@/lib/server/orgunits/list';

export const GET = withApiError(async (_req: NextRequest) => {
  const result = await listOrgunits();
  return NextResponse.json(result);
});
