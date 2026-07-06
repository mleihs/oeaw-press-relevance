import { NextRequest, NextResponse } from 'next/server';
import { withApiError, validateBody, validateParams } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireUser } from '@/lib/server/auth/require';
import { setBoardFavorite, withBoardErrors } from '@/lib/server/board';
import { favoritePayloadSchema } from '@/lib/shared/board-schemas';

export const POST = withApiError(withBoardErrors(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  const { favorite } = await validateBody(req, favoritePayloadSchema);
  await setBoardFavorite(user.id, id, favorite);
  return NextResponse.json({ ok: true });
}));
