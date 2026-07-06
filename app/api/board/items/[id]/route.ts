import { NextRequest, NextResponse } from 'next/server';
import { withApiError, validateBody, validateParams } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireUser } from '@/lib/server/auth/require';
import { patchItem, deleteItem, withBoardErrors } from '@/lib/server/board';
import { itemPatchSchema } from '@/lib/shared/board-schemas';

export const PATCH = withApiError(withBoardErrors(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  const patch = await validateBody(req, itemPatchSchema);
  const item = await patchItem(user.id, id, patch);
  return NextResponse.json({ item });
}));

export const DELETE = withApiError(withBoardErrors(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  await deleteItem(id);
  return NextResponse.json({ ok: true });
}));
