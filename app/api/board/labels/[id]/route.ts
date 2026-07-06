import { NextRequest, NextResponse } from 'next/server';
import { withApiError, validateParams } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireUser } from '@/lib/server/auth/require';
import { deleteLabel, withBoardErrors } from '@/lib/server/board';

// Label board-weit löschen: card_labels cascaden per FK, die Karten behalten
// nur das Label nicht mehr.
export const DELETE = withApiError(withBoardErrors(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  await deleteLabel(id);
  return NextResponse.json({ ok: true });
}));
