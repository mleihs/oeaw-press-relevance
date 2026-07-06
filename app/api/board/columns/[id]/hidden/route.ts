import { NextRequest, NextResponse } from 'next/server';
import { withApiError, validateParams } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireUser } from '@/lib/server/auth/require';
import { hideColumn, unhideColumn, withBoardErrors } from '@/lib/server/board';

/** Kanal für den aktuellen Nutzer ausblenden. Per-User (user_hidden_columns);
 *  User kommt aus der Session, nicht aus dem Body. */
export const POST = withApiError(withBoardErrors(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  await hideColumn(user.id, id);
  return NextResponse.json({ ok: true });
}));

/** Kanal für den aktuellen Nutzer wieder einblenden. */
export const DELETE = withApiError(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  await unhideColumn(user.id, id);
  return NextResponse.json({ ok: true });
});
