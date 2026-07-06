import { NextRequest, NextResponse } from 'next/server';
import { withApiError, validateBody, validateParams } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireUser } from '@/lib/server/auth/require';
import { addReference, withBoardErrors } from '@/lib/server/board';
import { referenceCreateSchema } from '@/lib/shared/board-schemas';

// Smart-Objekt-Referenz an eine Karte hängen (Event/Publikation per ID,
// YouTube per URL). Antwortet mit der vollständigen, aktualisierten
// Referenzliste (eine Quelle der Wahrheit für die Modal-Sektion).
export const POST = withApiError(withBoardErrors(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  const payload = await validateBody(req, referenceCreateSchema);
  const references = await addReference(user.id, id, payload);
  return NextResponse.json({ references });
}));
