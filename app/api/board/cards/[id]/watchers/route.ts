import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiError, validateBody, validateParams, validateQuery } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireUser } from '@/lib/server/auth/require';
import { addWatcher, removeWatcher, boardErrorToResponse } from '@/lib/server/board';
import { watcherCreateSchema } from '@/lib/shared/board-schemas';

export const POST = withApiError(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  const { user_id } = await validateBody(req, watcherCreateSchema);
  try {
    await addWatcher(id, user_id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = boardErrorToResponse(err);
    if (res) return res;
    throw err;
  }
});

export const DELETE = withApiError(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  const { user_id } = validateQuery(
    req.nextUrl.searchParams,
    z.object({ user_id: z.uuid() }),
  );
  await removeWatcher(id, user_id);
  return NextResponse.json({ ok: true });
});
