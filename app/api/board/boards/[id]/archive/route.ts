import { NextRequest, NextResponse } from 'next/server';
import { withApiError, validateParams } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireUser } from '@/lib/server/auth/require';
import { listArchivedCards, withBoardErrors } from '@/lib/server/board';

/** Archiv-Ansicht: alle archivierten Karten eines Boards (neueste zuerst). */
export const GET = withApiError(withBoardErrors(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  const cards = await listArchivedCards(id);
  return NextResponse.json({ cards });
}));
