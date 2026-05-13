import { NextRequest, NextResponse } from 'next/server';
import { withApiError } from '@/lib/server/http';
import { createSession } from '@/lib/server/sessions/lifecycle';

export const POST = withApiError(async (_req: NextRequest) => {
  const session = await createSession();
  return NextResponse.json({ session });
});
