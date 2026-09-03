import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { GATE_COOKIE_NAME, isPublicGatePath } from '@/lib/shared/gate';

/**
 * Proxy-based gate (Next 16 `proxy` file convention; was `middleware.ts`).
 *
 * The previous client-only `<PasswordGate>` was cosmetic — `/api/*` was
 * unprotected and anyone with the URL could query the API. This proxy
 * enforces the gate at the request boundary, before any route or RSC runs.
 *
 * Flow:
 *  1. Request comes in for any non-public path.
 *  2. The proxy checks for the `gate` cookie.
 *  3. If absent or invalid → API requests get 401 JSON; page requests get
 *     redirected to `/` (where the gate UI is shown).
 *  4. POST /api/auth/gate validates GATE_PASSWORD server-side and sets
 *     the cookie. Cookie value is the SHA-256 of the password (server-only
 *     comparison; never exposed to the browser).
 *
 * Public paths (no gate): /api/auth/gate (login endpoint), /robots.txt,
 * /favicon.ico, /_next/static/*, /capybara*.png (gate background images).
 */

/**
 * Konstantzeit-nahe Cookie-Prüfung für die Edge-Runtime: dort gibt es kein
 * `crypto.timingSafeEqual`, also werden beide Seiten per SHA-256 gehasht und
 * die Hex-Digests verglichen (Standard-Mitigation — der `===`-Vergleich läuft
 * dann über zwei gleich lange, vom Angreifer nicht steuerbare Digests, sodass
 * ein Timing-Leck nichts über den Token-Inhalt verrät).
 */
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function timingSafeTokenMatch(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  return ha === hb;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublicGatePath(pathname)) return NextResponse.next();

  // Local-dev bypass. The gate protects the *deployed* app; PasswordGate
  // (components/password-gate.tsx) already skips its UI in development via
  // DevPassthrough. But GATE_TOKEN became a required env var (lib/server/
  // env.ts, 2026-05-15) — so without this, the server gate stays ON in dev
  // while the password form never renders, locking dev out with no way to
  // obtain a cookie. NODE_ENV is 'production' under `next build`/`next
  // start`, so production stays fully gated.
  if (process.env.NODE_ENV === 'development') return NextResponse.next();

  const cookie = req.cookies.get(GATE_COOKIE_NAME)?.value;
  const expected = process.env.GATE_TOKEN;

  // Fail-CLOSED if GATE_TOKEN is somehow unset in the Edge runtime. The
  // Node-runtime env validator (instrumentation.ts + lib/server/env.ts)
  // requires it and exits otherwise, so in practice this branch is
  // unreachable once the server has booted at all. But the Edge runtime
  // loads env independently of Node — a Vercel misconfig that sets the var
  // for Node but not Edge landed here. Früher: stiller Pass-through
  // (Availability vor Dichtheit); bewusst umgedreht, damit eine solche
  // Env-Drift sofort laut als 503 auffällt, statt die App lautlos komplett
  // zu öffnen.
  if (!expected) {
    return new NextResponse('Gate misconfigured', { status: 503 });
  }

  if (cookie && (await timingSafeTokenMatch(cookie, expected))) {
    return NextResponse.next();
  }

  // API requests: respond 401 JSON, no redirect.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Root path renders the gate UI (PasswordGate wraps the layout). Letting
  // it through unauthenticated is required — otherwise the redirect-to-root
  // below loops forever (`/` → `/` → `/`). Anything sensitive on the page
  // is gated client-side by PasswordGate; API calls from it still get 401.
  if (pathname === '/') return NextResponse.next();

  // Page requests: redirect to root (where the gate UI is).
  // Preserve the intended destination as `?next=` for post-login redirect.
  const url = req.nextUrl.clone();
  url.pathname = '/';
  url.searchParams.set('next', pathname);
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
