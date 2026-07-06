import { NextRequest, NextResponse } from 'next/server';
import { withApiError, validateBody, validateParams } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireUser } from '@/lib/server/auth/require';
import { patchColumn, deleteColumn, withBoardErrors } from '@/lib/server/board';
import { columnPatchSchema } from '@/lib/shared/board-schemas';

export const PATCH = withApiError(withBoardErrors(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  const patch = await validateBody(req, columnPatchSchema);
  const column = await patchColumn(id, patch);
  return NextResponse.json({ column });
}));

export const DELETE = withApiError(withBoardErrors(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  await deleteColumn(id);
  return NextResponse.json({ ok: true });
}));
