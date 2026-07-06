import { NextRequest, NextResponse } from 'next/server';
import { withApiError, validateParams } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireUser } from '@/lib/server/auth/require';
import { archiveCompletedInColumn, boardErrorToResponse } from '@/lib/server/board';

/** Alle erledigten Karten einer Spalte archivieren (Spalten-Aktion
 *  „Abgeschlossene archivieren"). Gibt die Anzahl archivierter Karten zurück. */
export const POST = withApiError(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  try {
    const archived = await archiveCompletedInColumn(user.id, id);
    return NextResponse.json({ archived });
  } catch (err) {
    const res = boardErrorToResponse(err);
    if (res) return res;
    throw err;
  }
});
