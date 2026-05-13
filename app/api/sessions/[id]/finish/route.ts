import { NextRequest, NextResponse } from 'next/server';
import { apiError, withApiError } from '@/lib/server/http';
import { sessionFinishPayloadSchema } from '@/lib/shared/schemas';
import {
  finishSession,
  SessionNotFoundError,
} from '@/lib/server/sessions/lifecycle';

export const POST = withApiError(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = sessionFinishPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? 'Invalid payload', 400);
  }
  try {
    const session = await finishSession(id, parsed.data);
    return NextResponse.json({ session });
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      return apiError(err.message, 404);
    }
    throw err;
  }
});
