import { NextRequest, NextResponse } from 'next/server';
import { withApiError, validateBody, validateParams } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireAdmin } from '@/lib/server/auth/require';
import { patchBoard, withBoardErrors } from '@/lib/server/board';
import { boardPatchSchema } from '@/lib/shared/board-schemas';

export const PATCH = withApiError(withBoardErrors(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireAdmin();
  const { id } = validateParams(await params, idParamSchema);
  const patch = await validateBody(req, boardPatchSchema);
  const board = await patchBoard(user.id, id, patch);
  return NextResponse.json({ board });
}));
