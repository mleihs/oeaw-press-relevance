import { NextResponse } from 'next/server';
import { bridgeOptions, bridgeRoute } from '@/lib/server/typo3-bridge/http';
import type { BridgeEventList } from '@/lib/server/typo3-bridge/contract';
import { lastSyncedAt, listBridgeEvents } from '@/lib/server/typo3-bridge/events';

// GET /api/typo3-bridge/events?q=<suche>&include=all
// Anstehende Events für den Event-Assistenten der Chrome-Extension, nach
// Beginn sortiert. Ohne include=all ohne `decision = 'skip'`; q filtert
// case-insensitiv auf Titel, Teaser und Institut. Vertrag: docs/TYPO3_BRIDGE.md,
// Typen: lib/server/typo3-bridge/contract.ts.

export const GET = bridgeRoute(async (req: Request) => {
  const params = new URL(req.url).searchParams;
  const [events, syncedAt] = await Promise.all([
    listBridgeEvents({ q: params.get('q') ?? undefined, includeAll: params.get('include') === 'all' }),
    lastSyncedAt(),
  ]);
  return NextResponse.json<BridgeEventList>({ events, synced_at: syncedAt });
});

export function OPTIONS(req: Request): Response {
  return bridgeOptions(req);
}
