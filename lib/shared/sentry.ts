import type { ErrorEvent, EventHint } from '@sentry/nextjs';
import { GATE_COOKIE_NAME } from './gate';

/**
 * Isomorphic Sentry helpers shared by every runtime init
 * (`sentry.server.config.ts`, `sentry.edge.config.ts`,
 * `instrumentation-client.ts`) and by the script bootstrap
 * (`scripts/lib/sentry.mjs`). Keeping the scrubber and base options in one
 * place means there is a single, testable definition of "what we send" — no
 * per-runtime `beforeSend` drift.
 *
 * This module must stay framework- and runtime-agnostic: no `server-only`,
 * no Node APIs, no `next/*` imports. It is pulled into the browser bundle via
 * the client config, so it can only touch plain data (the Sentry event) and
 * other isomorphic `lib/shared/*` modules.
 */

const REDACTED = '[redacted]';

/**
 * Request headers that can carry a secret. Lower-cased; matched
 * case-insensitively. `x-openrouter-key` is our per-request LLM key
 * (lib/server/llm.ts), the rest are the usual auth-bearing headers.
 */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-openrouter-key',
  'x-api-key',
  'x-supabase-auth',
]);

/**
 * Cookie names to strip from the event. The gate cookie is the SHA-256 of the
 * shared password (proxy access token); `sb-*` are Supabase-Auth session
 * cookies. Matched by exact name or, for Supabase, by prefix.
 */
const SENSITIVE_COOKIE_EXACT = new Set([GATE_COOKIE_NAME]);
const SENSITIVE_COOKIE_PREFIXES = ['sb-'];

function isSensitiveCookie(name: string): boolean {
  const lower = name.toLowerCase();
  if (SENSITIVE_COOKIE_EXACT.has(name)) return true;
  return SENSITIVE_COOKIE_PREFIXES.some((p) => lower.startsWith(p));
}

/** Redact sensitive keys from a `Record<string, string>` header/cookie bag. */
function scrubHeaderBag(bag: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(bag)) {
    out[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? REDACTED : v;
  }
  return out;
}

/**
 * `beforeSend` hook. Strips secrets that may ride along on the request context
 * the Next SDK attaches to server events: sensitive headers, the whole cookie
 * jar (gate/Supabase session), and the raw query string / `Cookie` header.
 * Defensive against both the object-shaped and string-shaped header/cookie
 * representations Sentry may produce.
 *
 * `sendDefaultPii` is already `false`, so IP/user data is not attached in the
 * first place — this is the second line that keeps our own app secrets out of
 * a third-party store.
 */
export function scrubSentryEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent {
  const req = event.request;
  if (!req) return event;

  // Headers are a name→value bag; redact the sensitive names.
  if (req.headers) {
    req.headers = scrubHeaderBag(req.headers);
  }

  // Cookies are a name→value bag; redact the gate / Supabase session cookies.
  if (req.cookies) {
    for (const name of Object.keys(req.cookies)) {
      if (isSensitiveCookie(name)) req.cookies[name] = REDACTED;
    }
  }

  // The raw query string can contain token-style params; keep it out entirely.
  if (req.query_string) req.query_string = REDACTED;

  return event;
}

/**
 * Runtime-agnostic base options every `Sentry.init` spreads. Error-monitoring
 * only, per the integration decision: no performance tracing, no session
 * replay. Each runtime adds its own `dsn`, `environment`, and `release`.
 */
export const sentryBaseOptions = {
  // Error monitoring only — no tracing, no replay.
  tracesSampleRate: 0,
  // Never attach IP / cookies / user by default; the scrubber is the backstop.
  sendDefaultPii: false,
  beforeSend: scrubSentryEvent,
} as const;
