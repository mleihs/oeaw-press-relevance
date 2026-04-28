import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware-based gate.
 *
 * The previous client-only `<PasswordGate>` was cosmetic — `/api/*` was
 * unprotected and anyone with the URL could query the API. This middleware
 * enforces the gate at the request boundary, before any route or RSC runs.
 *
 * Flow:
 *  1. Request comes in for any non-public path.
 *  2. Middleware checks for the `gate` cookie.
 *  3. If absent or invalid → API requests get 401 JSON; page requests get
 *     redirected to `/` (where the gate UI is shown).
 *  4. POST /api/auth/gate validates GATE_PASSWORD server-side and sets
 *     the cookie. Cookie value is the SHA-256 of the password (server-only
 *     comparison; never exposed to the browser).
 *
 * Public paths (no gate): /api/auth/gate (login endpoint), /robots.txt,
 * /favicon.ico, /_next/static/*, /capybara*.png (gate background images).
 */

const COOKIE_NAME = 'gate';

const PUBLIC_PATHS = [
  '/api/auth/gate',
  '/robots.txt',
  '/favicon.ico',
];

const PUBLIC_PREFIXES = [
  '/_next/',
  '/capybara',  // logo + gate background
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  const expected = process.env.GATE_TOKEN;

  // No GATE_TOKEN configured → middleware is in pass-through mode (dev only).
  // The PasswordGate UI still does the client-side check as a fallback.
  if (!expected) return NextResponse.next();

  if (cookie === expected) return NextResponse.next();

  // API requests: respond 401 JSON, no redirect.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Page requests: redirect to root (where the gate UI is).
  // Preserve the intended destination as `?next=` for post-login redirect.
  const url = req.nextUrl.clone();
  url.pathname = '/';
  if (pathname !== '/') url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Match everything except Next internals and static files. The matcher
    // is a regex over pathname; PUBLIC_PATHS/PREFIXES inside the function
    // are the source of truth for what's truly public.
    '/((?!_next/|favicon\\.ico|robots\\.txt).*)',
  ],
};
