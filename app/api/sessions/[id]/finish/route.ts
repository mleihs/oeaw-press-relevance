import { NextRequest, NextResponse } from 'next/server';
import { apiError, validateBody, withApiError } from '@/lib/server/http';
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
  const data = await validateBody(req, sessionFinishPayloadSchema);
  try {
    const session = await finishSession(id, data);
    return NextResponse.json({ session });
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      return apiError(err.message, 404);
    }
    throw err;
  }
});
