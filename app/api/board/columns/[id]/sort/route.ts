import { NextRequest, NextResponse } from 'next/server';
import { withApiError, validateBody, validateParams } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireUser } from '@/lib/server/auth/require';
import { sortColumnCards, withBoardErrors } from '@/lib/server/board';
import { columnSortSchema } from '@/lib/shared/board-schemas';

/** Alle Karten einer Spalte einmalig neu anordnen (nach Fälligkeit /
 *  alphabetisch / Erstelldatum). Alle Member dürfen Spalten bearbeiten
 *  (BOARD_PLAN §3.1). */
export const POST = withApiError(withBoardErrors(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  const { by } = await validateBody(req, columnSortSchema);
  await sortColumnCards(id, by);
  return NextResponse.json({ ok: true });
}));
