import { NextResponse } from 'next/server';

// Lightweight liveness probe for container healthchecks and uptime monitors.
// Deliberately DB-free and auth-free: point Coolify's healthcheck and any
// external monitor HERE, not at `/` (the force-dynamic dashboard). Hitting the
// dashboard on every probe runs the full score-similarity scatter + the
// publications-list scans and opens a fresh pooled DB connection (which reloads
// the pg type catalog) each time — the ~45s polling that was driving ~1.5 GB/day
// of shared-pooler egress with zero human traffic. This route touches no DB, so
// a probe costs nothing on the database side.
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    { status: 'ok' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
