import { NextRequest, NextResponse } from 'next/server';
import { apiError, validateBody, validateParams, withApiError } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireUser } from '@/lib/server/auth/require';
import { sessionFinishPayloadSchema } from '@/lib/shared/schemas';
import {
  finishSession,
  SessionNotFoundError,
} from '@/lib/server/sessions/lifecycle';

export const POST = withApiError(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  // Mutierend → angemeldete Identität Pflicht (Security-Audit M1).
  await requireUser();

  const { id } = validateParams(await params, idParamSchema);
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
