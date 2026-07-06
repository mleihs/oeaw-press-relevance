import { NextRequest, NextResponse } from 'next/server';
import { withApiError, validateBody, validateParams } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireUser } from '@/lib/server/auth/require';
import { moveCard, boardErrorToResponse } from '@/lib/server/board';
import { cardMoveSchema } from '@/lib/shared/board-schemas';

export const POST = withApiError(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  const { column_id, before_id, after_id } = await validateBody(req, cardMoveSchema);
  try {
    const card = await moveCard(user.id, id, column_id, before_id ?? null, after_id ?? null);
    return NextResponse.json({ card });
  } catch (err) {
    const res = boardErrorToResponse(err);
    if (res) return res;
    throw err;
  }
});
