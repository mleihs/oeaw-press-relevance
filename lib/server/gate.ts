// Server-only gate crypto, shared by the /api/auth/gate login route. Extracted
// here so the security-critical comparison is unit-testable — a Next route file
// can't carry arbitrary named exports. (Path classification + the cookie name
// live in lib/shared/gate.ts so the Edge proxy can use them crypto-free.)

import 'server-only';
import { createHash, timingSafeEqual } from 'crypto';

/** Cookie-Attribute des Gate-Cookies — geteilt zwischen /api/auth/gate und
 *  /api/auth/login (ein persönlicher Login ist strikt stärker als das
 *  gemeinsame Übergangs-Passwort und setzt das Gate-Cookie deshalb mit).
 *  sameSite strict, weil jede mutierende Route zusätzlich assertSameOrigin
 *  erzwingt (lib/server/http.ts). */
export const GATE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 24 * 30, // 30 days
} as const;

/** SHA-256 hex of the password — the value stored in the cookie / GATE_TOKEN.
 *  Hashing keeps the raw password out of the browser jar. */
export function tokenize(password: string): string {
  return createHash('sha256').update(password, 'utf8').digest('hex');
}

/** Constant-time password check. Hashing both sides first yields equal-length
 *  buffers for timingSafeEqual AND avoids leaking the password length via the
 *  comparison. */
export function timingSafePasswordMatch(input: string, expected: string): boolean {
  const inputHash = createHash('sha256').update(input, 'utf8').digest();
  const expectedHash = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(inputHash, expectedHash);
}
