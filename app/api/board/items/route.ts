import { NextRequest, NextResponse } from 'next/server';
import { withApiError, validateBody } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth/require';
import { addItem, boardErrorToResponse } from '@/lib/server/board';
import { itemCreateSchema } from '@/lib/shared/board-schemas';

export const POST = withApiError(async (req: NextRequest) => {
  await requireUser();
  const payload = await validateBody(req, itemCreateSchema);
  try {
    const item = await addItem(payload);
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    const res = boardErrorToResponse(err);
    if (res) return res;
    throw err;
  }
});
