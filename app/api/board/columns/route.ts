import { NextRequest, NextResponse } from 'next/server';
import { withApiError, validateBody } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth/require';
import { createColumn } from '@/lib/server/board';
import { columnCreateSchema } from '@/lib/shared/board-schemas';

// Spalten dürfen alle Member anlegen (MT-Kultur, §3.1).
export const POST = withApiError(async (req: NextRequest) => {
  await requireUser();
  const { board_id, name, color } = await validateBody(req, columnCreateSchema);
  const column = await createColumn(board_id, name, color);
  return NextResponse.json({ column }, { status: 201 });
});
