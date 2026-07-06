import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiError, validateParams } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth/require';
import { removeReference, boardErrorToResponse } from '@/lib/server/board';

const paramsSchema = z.object({ id: z.uuid(), refId: z.uuid() });

// Referenz lösen. Verwaiste externe Objekte (kein weiterer Link) werden
// serverseitig mitgeräumt (inkl. gespiegeltem Thumbnail).
export const DELETE = withApiError(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; refId: string }> },
) => {
  const user = await requireUser();
  const { id, refId } = validateParams(await params, paramsSchema);
  try {
    const references = await removeReference(user.id, id, refId);
    return NextResponse.json({ references });
  } catch (err) {
    const res = boardErrorToResponse(err);
    if (res) return res;
    throw err;
  }
});
