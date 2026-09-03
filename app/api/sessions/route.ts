import { NextRequest, NextResponse } from 'next/server';
import { withApiError } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth/require';
import { createSession } from '@/lib/server/sessions/lifecycle';

export const POST = withApiError(async (_req: NextRequest) => {
  // Mutierend → angemeldete Identität Pflicht (Security-Audit M1).
  await requireUser();

  const session = await createSession();
  return NextResponse.json({ session });
});
