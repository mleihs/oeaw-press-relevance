import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, validateBody } from '@/lib/server/http';
import { bridgeOptions, bridgeRoute, isBridgeEventId } from '@/lib/server/typo3-bridge/http';
import { INSTRUCTIONS_MAX } from '@/lib/server/typo3-bridge/draft-prompt';
import type { BridgeDraftResponse } from '@/lib/server/typo3-bridge/contract';
import { getOrCreateDraft } from '@/lib/server/typo3-bridge/draft-service';
import { draftErrorResponse } from '@/lib/server/typo3-bridge/errors';

// POST /api/typo3-bridge/events/:id/draft   Body (optional): { refresh?, instructions? }
// KI-Entwurf der TYPO3-Felder (Claude Opus 5.5, serverseitig). Ohne refresh
// kommt ein gespeicherter Entwurf zurück (cached: true), außer ein neuer
// Zusatzwunsch verlangt einen neuen. Regeln: lib/server/typo3-bridge/draft-service.ts.

// Ein Entwurf dauert mit Effort high typischerweise unter einer Minute; die
// Obergrenze gilt für Vercel, auf der Box begrenzt der Proxy.
export const maxDuration = 300;

const bodySchema = z.object({
  refresh: z.boolean().optional(),
  instructions: z
    .string()
    .max(INSTRUCTIONS_MAX, `Der Zusatzwunsch darf höchstens ${INSTRUCTIONS_MAX} Zeichen haben.`)
    .optional(),
});

export const POST = bridgeRoute(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!isBridgeEventId(id)) return apiError('Event nicht gefunden.', 404);
  const body = await validateBody(req, bodySchema);
  try {
    const result = await getOrCreateDraft(id, body);
    if (!result) return apiError('Event nicht gefunden.', 404);
    return NextResponse.json<BridgeDraftResponse>(result);
  } catch (err) {
    const mapped = draftErrorResponse(err);
    if (mapped) return mapped;
    throw err;
  }
});

export function OPTIONS(req: Request): Response {
  return bridgeOptions(req);
}
