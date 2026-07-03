import { NextRequest, NextResponse } from 'next/server';
import { withApiError, validateBody } from '@/lib/server/http';
import { requireUser, requireAdmin } from '@/lib/server/auth/require';
import { listBoards, createBoard } from '@/lib/server/board';
import { boardCreateSchema } from '@/lib/shared/board-schemas';

export const GET = withApiError(async () => {
  const user = await requireUser();
  const boards = await listBoards(user.id);
  return NextResponse.json({ boards });
});

export const POST = withApiError(async (req: NextRequest) => {
  await requireAdmin();
  const { name } = await validateBody(req, boardCreateSchema);
  const board = await createBoard(name);
  return NextResponse.json({ board }, { status: 201 });
});
