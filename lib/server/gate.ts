// Server-only gate crypto, shared by the /api/auth/gate login route. Extracted
// here so the security-critical comparison is unit-testable — a Next route file
// can't carry arbitrary named exports. (Path classification + the cookie name
// live in lib/shared/gate.ts so the Edge proxy can use them crypto-free.)

import 'server-only';
import { createHash, timingSafeEqual } from 'crypto';

// MERKPOSTEN TYPO3-Bridge (2026-11-27): Die TYPO3-Bridge hat wie das Gate ein
// gemeinsames Token (TYPO3_BRIDGE_TOKEN), für denselben Personenkreis. Wer das
// Gate-Passwort tauscht, tauscht das Token mit. Die benannten Tokens aus
// TYPO3_BRIDGE_TOKENS (Weitergaben nach außen) hängen nicht am Gate und
// bleiben beim Tausch gültig; gesperrt werden sie einzeln. Wird das Gate
// abgelöst, stellt die Bridge auf persönliche Tokens um.
// Details: docs/TYPO3_BRIDGE.md, „Token-Politik".

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
