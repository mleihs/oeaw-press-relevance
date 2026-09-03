// Shared Sentry bootstrap for scripts/*.
//
// The ingestion/scoring/sync scripts run OUTSIDE the Next app (nightly delta
// import, prod syncs, enrichment). Historically a silent crash there went
// unnoticed. One line at the top of a script — after it has loaded its env —
// wires global crash handlers that report to Sentry and flush before exit:
//
//   import { initScriptSentry, flushAndExit } from './lib/sentry.mjs';
//   process.loadEnvFile('.env.local');
//   initScriptSentry('import-publications-delta');
//   ...
//   await flushAndExit(0);   // optional: clean flush on the success path
//
// Fail-open: with no SENTRY_DSN the module is inert (no init, handlers are not
// registered), so local runs need no Sentry account. @sentry/node is a direct
// dependency (installed alongside @sentry/nextjs, same version).

import * as Sentry from '@sentry/node';

let initialized = false;

// ---------------------------------------------------------------------------
// Secret-Scrubber — FORMEL-ZWILLING von lib/shared/sentry.ts (scrubSentryEvent).
// Ein .mjs kann das TS-Modul zur Laufzeit nicht importieren, deshalb ist der
// Hook hier minimal repliziert. Änderungen IMMER in beiden Dateien nachziehen.
// Scripts tragen i.d.R. keinen Request-Kontext, aber der Hook kostet nichts
// und hält Header/Cookies/Query-String sicher aus Events heraus, falls doch
// einer mitkommt (z.B. via captureScriptError-Extra).
// ---------------------------------------------------------------------------
const REDACTED = '[redacted]';
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-openrouter-key',
  'x-api-key',
  'x-supabase-auth',
]);
// 'gate' = GATE_COOKIE_NAME (lib/shared/gate.ts); 'sb-*' = Supabase-Session.
const SENSITIVE_COOKIE_EXACT = new Set(['gate']);
const SENSITIVE_COOKIE_PREFIXES = ['sb-'];

function isSensitiveCookie(name) {
  const lower = name.toLowerCase();
  if (SENSITIVE_COOKIE_EXACT.has(name)) return true;
  return SENSITIVE_COOKIE_PREFIXES.some((p) => lower.startsWith(p));
}

/** beforeSend-Hook: Zwilling von scrubSentryEvent in lib/shared/sentry.ts. */
export function scrubScriptSentryEvent(event) {
  const req = event.request;
  if (!req) return event;
  if (req.headers) {
    const out = {};
    for (const [k, v] of Object.entries(req.headers)) {
      out[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? REDACTED : v;
    }
    req.headers = out;
  }
  if (req.cookies) {
    for (const name of Object.keys(req.cookies)) {
      if (isSensitiveCookie(name)) req.cookies[name] = REDACTED;
    }
  }
  if (req.query_string) req.query_string = REDACTED;
  return event;
}

/**
 * Initialise Sentry for a script and install process-level crash handlers.
 * Idempotent and safe to call when SENTRY_DSN is unset (returns false).
 * `scriptName` is attached as a tag so events are filterable per script.
 */
export function initScriptSentry(scriptName) {
  if (initialized) return true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'production',
    release: process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA,
    // Error monitoring only — no tracing. Scrubber = Zwilling des Web-App-
    // Hooks (s.o., lib/shared/sentry.ts).
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: scrubScriptSentryEvent,
  });
  Sentry.setTags({ runner: 'script', script: scriptName });

  // The whole point: a crash that would otherwise vanish into the void now
  // reports, then the process exits non-zero after the event is flushed.
  process.on('unhandledRejection', (reason) => {
    Sentry.captureException(reason);
    void flushAndExit(1);
  });
  process.on('uncaughtException', (err) => {
    Sentry.captureException(err);
    void flushAndExit(1);
  });

  initialized = true;
  return true;
}

/**
 * Explicitly report a caught error (for scripts that catch-and-exit rather
 * than letting the throw propagate to the global handlers). No-op-safe when
 * Sentry was never initialised.
 */
export function captureScriptError(err, context) {
  if (!initialized) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

/**
 * Flush pending events (Sentry batches sends) and exit. Always call this
 * instead of a bare `process.exit` on paths that may have captured an event —
 * otherwise the process can exit before the event leaves the machine. Safe to
 * call when Sentry is disabled (just exits).
 */
export async function flushAndExit(code = 0) {
  if (initialized) {
    try {
      await Sentry.flush(2000);
    } catch {
      // Best-effort — never block shutdown on the flush.
    }
  }
  process.exit(code);
}
