import { NextRequest, NextResponse } from 'next/server';
import { withApiError, validateBody, validateParams } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireUser } from '@/lib/server/auth/require';
import { patchItem, deleteItem, boardErrorToResponse } from '@/lib/server/board';
import { itemPatchSchema } from '@/lib/shared/board-schemas';

export const PATCH = withApiError(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  const patch = await validateBody(req, itemPatchSchema);
  try {
    const item = await patchItem(user.id, id, patch);
    return NextResponse.json({ item });
  } catch (err) {
    const res = boardErrorToResponse(err);
    if (res) return res;
    throw err;
  }
});

export const DELETE = withApiError(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  try {
    await deleteItem(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = boardErrorToResponse(err);
    if (res) return res;
    throw err;
  }
});
