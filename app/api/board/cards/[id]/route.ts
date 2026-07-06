import { NextRequest, NextResponse } from 'next/server';
import { withApiError, validateBody, validateParams } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireUser } from '@/lib/server/auth/require';
import {
  getCardDetail,
  patchCard,
  deleteCard,
  withBoardErrors,
} from '@/lib/server/board';
import { cardPatchSchema } from '@/lib/shared/board-schemas';

export const GET = withApiError(withBoardErrors(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  const card = await getCardDetail(id);
  return NextResponse.json({ card });
}));

export const PATCH = withApiError(withBoardErrors(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  const patch = await validateBody(req, cardPatchSchema);
  const card = await patchCard(user.id, id, patch);
  return NextResponse.json({ card });
}));

export const DELETE = withApiError(withBoardErrors(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  await deleteCard(id);
  return NextResponse.json({ ok: true });
}));
