import { NextResponse } from 'next/server';
import { withApiError } from '@/lib/server/http';
import { getCurrentUser } from '@/lib/server/auth/require';

export const dynamic = 'force-dynamic';

// Logged-out ist hier ein regulärer Zustand (user: null), kein 401 — die
// Nav rendert dann den Anmelden-Link statt des Avatars, ohne Console-Noise.
// Nebeneffekt: getUser() refresht eine abgelaufene Session (client.ts).
export const GET = withApiError(async () => {
  return NextResponse.json({ user: await getCurrentUser() });
});
