import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { apiError, withApiError } from '@/lib/server/http';

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

// In-memory rate limit per Lambda instance. On serverless, multiple
// instances mean a determined attacker can scale around this — for a
// shared limit we'd need Redis/Upstash. Single instance still raises
// the cost of brute-force enough to matter for our internal-tool
// threat model.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: NextRequest): string {
  // x-forwarded-for is "client, proxy1, proxy2…" — take the first hop.
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) return false;
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count++;
}

// Exported for tests; resets the in-memory rate-limit map.
export function _resetRateLimit(): void {
  attempts.clear();
}

export const POST = withApiError(async (req: NextRequest) => {
  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return apiError('Too many login attempts. Try again in 1 minute.', 429);
  }

  let body: { password?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiError('Invalid request body', 400);
  }

  const password = typeof body.password === 'string' ? body.password : '';
  const expectedPassword = process.env.GATE_PASSWORD;

  if (!expectedPassword) {
    // Dev mode without GATE_PASSWORD configured — accept anything but warn.
    return NextResponse.json({ ok: true, mode: 'dev-passthrough' });
  }

  if (!timingSafePasswordMatch(password, expectedPassword)) {
    recordFailure(ip);
    return apiError('Invalid password', 401);
  }

  // Success: clear failure history for this IP.
  attempts.delete(ip);

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
