import { NextRequest, NextResponse } from 'next/server';
import { withApiError, validateBody, validateParams } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireUser } from '@/lib/server/auth/require';
import { editComment, deleteComment, withBoardErrors } from '@/lib/server/board';
import { commentPatchSchema } from '@/lib/shared/board-schemas';

export const PATCH = withApiError(withBoardErrors(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  const { body_md } = await validateBody(req, commentPatchSchema);
  const comment = await editComment(user, id, body_md);
  return NextResponse.json({ comment });
}));

export const DELETE = withApiError(withBoardErrors(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  await deleteComment(user, id);
  return NextResponse.json({ ok: true });
}));
