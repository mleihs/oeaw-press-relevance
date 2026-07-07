import { NextResponse } from 'next/server';
import { withApiError } from '@/lib/server/http';
import { getLandingStats } from '@/lib/server/stats/landing';

// Kennzahlen fürs Marken-Panel des Anmelde-Screens. GATE-ÖFFENTLICH
// (lib/shared/gate.ts): der Screen zeigt sie VOR dem Gate. Nur aggregierte,
// unsensible count(*)-Werte. Cookie-unabhängig → Edge-Cache greift; zusätzlich
// ist getLandingStats server-seitig 1 h gecacht.
export const revalidate = 3600;

export const GET = withApiError(async () => {
  const stats = await getLandingStats();
  return NextResponse.json(stats);
});
