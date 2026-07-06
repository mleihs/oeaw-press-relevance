import { NextRequest, NextResponse } from 'next/server';
import { withApiError, validateBody } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth/require';
import { createCard, withBoardErrors } from '@/lib/server/board';
import { cardCreateSchema } from '@/lib/shared/board-schemas';

export const POST = withApiError(withBoardErrors(async (req: NextRequest) => {
  const user = await requireUser();
  const payload = await validateBody(req, cardCreateSchema);
  const card = await createCard(user.id, payload);
  return NextResponse.json({ card }, { status: 201 });
}));
