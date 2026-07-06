import { NextRequest, NextResponse } from 'next/server';
import { withApiError, validateBody } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth/require';
import { addItem, withBoardErrors } from '@/lib/server/board';
import { itemCreateSchema } from '@/lib/shared/board-schemas';

export const POST = withApiError(withBoardErrors(async (req: NextRequest) => {
  const user = await requireUser();
  const payload = await validateBody(req, itemCreateSchema);
  const item = await addItem(user.id, payload);
  return NextResponse.json({ item }, { status: 201 });
}));
