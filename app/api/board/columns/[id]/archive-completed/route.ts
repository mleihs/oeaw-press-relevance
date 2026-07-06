import { NextRequest, NextResponse } from 'next/server';
import { withApiError, validateParams } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireUser } from '@/lib/server/auth/require';
import { archiveCompletedInColumn, withBoardErrors } from '@/lib/server/board';

/** Alle erledigten Karten einer Spalte archivieren (Spalten-Aktion
 *  „Abgeschlossene archivieren"). Gibt die Anzahl archivierter Karten zurück. */
export const POST = withApiError(withBoardErrors(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  const archived = await archiveCompletedInColumn(user.id, id);
  return NextResponse.json({ archived });
}));
