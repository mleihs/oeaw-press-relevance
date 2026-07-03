import { NextRequest, NextResponse } from 'next/server';
import { withApiError, ApiValidationError } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth/require';
import { getCardsForSource } from '@/lib/server/board';

// „Liegt im Board?" — Karten zu einem Event bzw. einer Publikation. Genau einer
// der beiden Parameter ist Pflicht. Für die „Im Board"-Anzeige an Event-Cockpit
// und Publikations-Detail.
export const GET = withApiError(async (req: NextRequest) => {
  await requireUser();
  const sp = req.nextUrl.searchParams;
  const eventId = sp.get('event_id') ?? undefined;
  const publicationId = sp.get('publication_id') ?? undefined;
  if (!eventId && !publicationId) {
    throw new ApiValidationError('event_id oder publication_id erforderlich.');
  }
  const cards = await getCardsForSource({ eventId, publicationId });
  return NextResponse.json({ cards });
});
