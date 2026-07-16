// Gate constants + path classification. Crypto-free and dependency-free so the
// Edge-runtime proxy can import it without pulling node:crypto into the Edge
// bundle (the password hashing lives in lib/server/gate.ts instead).

export const GATE_COOKIE_NAME = 'gate';

// Paths reachable without a gate cookie: the login endpoint itself, plus a few
// static assets. PUBLIC_PREFIXES match by startsWith.
// /api/auth/login ist bewusst gate-öffentlich: der vereinheitlichte Anmelde-
// Screen (AuthScreen am Gate) bietet den persönlichen Login VOR dem Gate an.
// Die Route ist rate-limitiert und verlangt echte Supabase-Credentials;
// bei Erfolg setzt sie das Gate-Cookie gleich mit (app/api/auth/login).
// /api/stats/landing ist gate-öffentlich: der Anmelde-Screen zeigt die drei
// aggregierten Kennzahlen (bewertete Pubs / anstehende Events / PMs mit DOI)
// VOR dem Gate. Nur unsensible count(*)-Werte, keine Auth-Logik.
// /api/ingest/run ist gate-öffentlich, aber NICHT ungeschützt: die Route
// authentifiziert sich per Bearer INGEST_CRON_SECRET (assertCronSecret). Der
// Nacht-Cron hat kein Gate-Cookie; das Gate-Cookie allein reicht dort NIE.
const PUBLIC_PATHS = ['/api/auth/gate', '/api/auth/login', '/api/stats/landing', '/api/ingest/run', '/robots.txt', '/favicon.ico', '/icon.svg'];
const PUBLIC_PREFIXES = ['/_next/', '/capybara'];

export function isPublicGatePath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}
