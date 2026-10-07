import type { ErrorEvent, EventHint, init } from '@sentry/nextjs';
import { GATE_COOKIE_NAME } from './gate';

/**
 * Isomorphic Sentry helpers shared by every runtime init
 * (`sentry.server.config.ts`, `sentry.edge.config.ts`,
 * `instrumentation-client.ts`). Keeping the scrubber and base options in one
 * place means there is a single, testable definition of "what we send" — no
 * per-runtime `beforeSend` drift. Ausnahme: das Script-Bootstrap
 * `scripts/lib/sentry.mjs` kann dieses TS-Modul zur Laufzeit nicht
 * importieren und hält deshalb einen minimalen ZWILLING des Scrubbers —
 * Änderungen an `scrubSentryEvent` dort nachziehen.
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
 *
 * ZWILLING: `scripts/lib/sentry.mjs` (`scrubScriptSentryEvent`) repliziert
 * diesen Hook, weil .mjs das TS-Modul nicht importieren kann — Änderungen
 * hier dort nachziehen.
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

/** Header/query-param fragments Sentry treats as identifying (v10 PII filter). */
const PII_DENY = ['forwarded', '-ip', 'remote-', 'via', '-user'];

/**
 * What the SDK may collect, pinned to the v10 `sendDefaultPii: false` level.
 * Sentry 11 replaced `sendDefaultPii` with `dataCollection` and collects much
 * more when it is left unset (user IP, cookies, HTTP bodies, DB query data).
 * A leftover `sendDefaultPii: false` is silently ignored, so the restrictive
 * baseline has to be spelled out. Values from Sentry's v10→v11 migration guide
 * ("keep the v10 default behavior"). Twin in `scripts/lib/sentry.mjs`.
 */
export const sentryDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { deny: PII_DENY }, response: { deny: PII_DENY } },
  httpBodies: [],
  urlQueryParams: { deny: PII_DENY },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
};

/**
 * Runtime-agnostic base options every `Sentry.init` spreads. Error-monitoring
 * only, per the integration decision: no performance tracing, no session
 * replay. Each runtime adds its own `dsn`, `environment`, and `release`.
 * `satisfies` keeps excess-property checks on: an option the SDK dropped
 * (as v11 did with `sendDefaultPii`) fails the typecheck instead of being
 * ignored at runtime, which a plain spread into `Sentry.init` would allow.
 */
export const sentryBaseOptions = {
  // Error monitoring only — no tracing, no replay.
  tracesSampleRate: 0,
  // Never attach IP / cookies / user by default; the scrubber is the backstop.
  dataCollection: sentryDataCollection,
  beforeSend: scrubSentryEvent,
} satisfies Partial<Parameters<typeof init>[0]>;
