import { NextRequest, NextResponse } from 'next/server';
import { withApiError } from '@/lib/server/http';
import { listPublications } from '@/lib/server/publications/list';

export const GET = withApiError(async (req: NextRequest) => {
  const result = await listPublications(
    new URL(req.url).searchParams,
  );
  return NextResponse.json(result);
});
