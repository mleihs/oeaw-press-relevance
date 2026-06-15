// Gate constants + path classification. Crypto-free and dependency-free so the
// Edge-runtime proxy can import it without pulling node:crypto into the Edge
// bundle (the password hashing lives in lib/server/gate.ts instead).

export const GATE_COOKIE_NAME = 'gate';

// Paths reachable without a gate cookie: the login endpoint itself, plus a few
// static assets. PUBLIC_PREFIXES match by startsWith.
const PUBLIC_PATHS = ['/api/auth/gate', '/robots.txt', '/favicon.ico'];
const PUBLIC_PREFIXES = ['/_next/', '/capybara'];

export function isPublicGatePath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}
