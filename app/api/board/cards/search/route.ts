import { NextRequest, NextResponse } from 'next/server';
import { withApiError } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth/require';
import { searchCards } from '@/lib/server/board';

// Board-übergreifende Kartensuche für die ⌘K-Palette. Auth-gated wie alle
// Board-Reads; leere Query -> leere Trefferliste.
export const GET = withApiError(async (req: NextRequest) => {
  await requireUser();
  const q = req.nextUrl.searchParams.get('q') ?? '';
  const cards = await searchCards(q);
  return NextResponse.json({ cards });
});
