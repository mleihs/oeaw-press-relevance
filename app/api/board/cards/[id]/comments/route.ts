import { NextRequest, NextResponse } from 'next/server';
import { withApiError, validateBody, validateParams } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireUser } from '@/lib/server/auth/require';
import { addComment, boardErrorToResponse } from '@/lib/server/board';
import { commentCreateSchema } from '@/lib/shared/board-schemas';

export const POST = withApiError(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  const { body_md } = await validateBody(req, commentCreateSchema);
  try {
    const comment = await addComment(user.id, id, body_md);
    return NextResponse.json({ comment });
  } catch (err) {
    const res = boardErrorToResponse(err);
    if (res) return res;
    throw err;
  }
});
