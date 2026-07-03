import { NextRequest, NextResponse } from 'next/server';
import { withApiError, validateBody, validateParams } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireUser } from '@/lib/server/auth/require';
import { convertItemToCard, boardErrorToResponse } from '@/lib/server/board';
import { itemConvertSchema } from '@/lib/shared/board-schemas';

// Unteraufgabe -> eigene Karte (Zeitreise-Workflow, §5).
export const POST = withApiError(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  const payload = await validateBody(req, itemConvertSchema);
  try {
    const card = await convertItemToCard(user.id, id, payload);
    return NextResponse.json({ card }, { status: 201 });
  } catch (err) {
    const res = boardErrorToResponse(err);
    if (res) return res;
    throw err;
  }
});
