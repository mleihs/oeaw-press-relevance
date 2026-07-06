import { NextRequest, NextResponse } from 'next/server';
import { apiError, validateBody, withApiError } from '@/lib/server/http';
import { gatePayloadSchema } from '@/lib/shared/schemas';
import { createRateLimiter, getClientIp } from '@/lib/server/rate-limit';
import { tokenize, timingSafePasswordMatch, GATE_COOKIE_OPTIONS } from '@/lib/server/gate';

// Login endpoint for the middleware gate. The browser POSTs the password
// here; we compare against GATE_PASSWORD server-side and, on match, set
// an HttpOnly cookie containing the SHA-256 of the password (which the
// middleware then matches against GATE_TOKEN — pre-computed in env).
//
// Why the indirection (password → token):
// - Storing the raw password in the cookie would expose it to anyone who
//   reads the browser jar, including via XSS. SHA-256 hides it.
// - Pre-computing the token in env (`GATE_TOKEN=sha256(GATE_PASSWORD)`)
//   means the middleware never needs to hash on every request.

// tokenize + timingSafePasswordMatch now live in lib/server/gate.ts (shared
// with the proxy, and unit-tested there).

// Module-scoped limiter persists for the lifetime of the Lambda instance.
const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 60_000 });

export const POST = withApiError(async (req: NextRequest) => {
  const ip = getClientIp(req);
  if (limiter.isBlocked(ip)) {
    return apiError('Too many login attempts. Try again in 1 minute.', 429);
  }

  // Rate-limit is checked first (above) so the body validation cannot be
  // used to sidestep it. validateBody throws -> withApiError returns a
  // structured 400 (replaces the bespoke try/catch + typeof guard).
  const { password } = await validateBody(req, gatePayloadSchema);
  // GATE_PASSWORD is required by the env validator (lib/server/env.ts).
  // The Node-runtime boot would have process.exit'd before reaching this
  // handler if it were unset, so the non-null assertion is safe.
  const expectedPassword = process.env.GATE_PASSWORD!;

  if (!timingSafePasswordMatch(password, expectedPassword)) {
    limiter.recordFailure(ip);
    return apiError('Invalid password', 401);
  }

  limiter.reset(ip);

  const token = tokenize(password);
  const res = NextResponse.json({ ok: true });
  res.cookies.set('gate', token, GATE_COOKIE_OPTIONS);
  return res;
});

// DELETE for explicit logout (clears the cookie).
export const DELETE = withApiError(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete('gate');
  return res;
});
