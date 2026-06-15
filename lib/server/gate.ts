// Server-only gate crypto, shared by the /api/auth/gate login route. Extracted
// here so the security-critical comparison is unit-testable — a Next route file
// can't carry arbitrary named exports. (Path classification + the cookie name
// live in lib/shared/gate.ts so the Edge proxy can use them crypto-free.)

import { createHash, timingSafeEqual } from 'crypto';

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
