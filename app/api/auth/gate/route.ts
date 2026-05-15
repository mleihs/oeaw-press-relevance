import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { apiError, withApiError } from '@/lib/server/http';
import { createRateLimiter, getClientIp } from '@/lib/server/rate-limit';

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

function tokenize(password: string): string {
  return createHash('sha256').update(password, 'utf8').digest('hex');
}

// timingSafeEqual on equal-length 32-byte SHA-256 hashes. Hashing first
// also avoids leaking the password length via the comparison itself.
function timingSafePasswordMatch(input: string, expected: string): boolean {
  const inputHash = createHash('sha256').update(input, 'utf8').digest();
  const expectedHash = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(inputHash, expectedHash);
}

// Module-scoped limiter persists for the lifetime of the Lambda instance.
const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 60_000 });

export const POST = withApiError(async (req: NextRequest) => {
  const ip = getClientIp(req);
  if (limiter.isBlocked(ip)) {
    return apiError('Too many login attempts. Try again in 1 minute.', 429);
  }

  let body: { password?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiError('Invalid request body', 400);
  }

  const password = typeof body.password === 'string' ? body.password : '';
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
  res.cookies.set('gate', token, {
    httpOnly: true,
    // Strict because every mutating route also enforces same-origin via
    // assertSameOrigin (lib/server/http.ts). Lax was leaving a CSRF window
    // open on top-level POST navigations.
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
});

// DELETE for explicit logout (clears the cookie).
export const DELETE = withApiError(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete('gate');
  return res;
});
