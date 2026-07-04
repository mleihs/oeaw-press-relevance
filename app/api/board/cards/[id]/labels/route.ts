import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiError, validateBody, validateParams, validateQuery } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireUser } from '@/lib/server/auth/require';
import { addCardLabel, removeCardLabel, boardErrorToResponse } from '@/lib/server/board';
import { cardLabelSchema } from '@/lib/shared/board-schemas';

export const POST = withApiError(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  const { label_id } = await validateBody(req, cardLabelSchema);
  try {
    await addCardLabel(id, label_id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const res = boardErrorToResponse(err);
    if (res) return res;
    throw err;
  }
});

export const DELETE = withApiError(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  const { label_id } = validateQuery(
    req.nextUrl.searchParams,
    z.object({ label_id: z.uuid() }),
  );
  await removeCardLabel(id, label_id);
  return NextResponse.json({ ok: true });
});
