import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiError, validateParams } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth/require';
import { refreshReference, boardErrorToResponse } from '@/lib/server/board';

const paramsSchema = z.object({ id: z.uuid(), refId: z.uuid() });

// YouTube-Snapshot einer Referenz neu ziehen (Titel/Dauer/Views/Thumbnail).
// Interne Referenzen sind immer live und antworten hier mit 400.
export const POST = withApiError(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; refId: string }> },
) => {
  await requireUser();
  const { id, refId } = validateParams(await params, paramsSchema);
  try {
    const references = await refreshReference(id, refId);
    return NextResponse.json({ references });
  } catch (err) {
    const res = boardErrorToResponse(err);
    if (res) return res;
    throw err;
  }
});
