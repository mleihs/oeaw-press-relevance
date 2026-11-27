import { NextResponse } from 'next/server';
import { apiError } from '@/lib/server/http';
import { bridgeOptions, bridgeRoute, isBridgeEventId } from '@/lib/server/typo3-bridge/http';
import type { BridgeEventDetail } from '@/lib/server/typo3-bridge/contract';
import { getBridgeEvent } from '@/lib/server/typo3-bridge/events';

// GET /api/typo3-bridge/events/:id
// Ein Event inkl. bodytext (HTML wie aus TYPO3) und event_information
// (gesäubertes HTML). Unbekannte oder ungültige id → 404.

export const GET = bridgeRoute(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const event = isBridgeEventId(id) ? await getBridgeEvent(id) : null;
  if (!event) return apiError('Event nicht gefunden.', 404);
  return NextResponse.json<BridgeEventDetail>(event);
});

export function OPTIONS(req: Request): Response {
  return bridgeOptions(req);
}
