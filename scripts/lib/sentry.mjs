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
    // Error monitoring only — no tracing. Scripts carry no request context, so
    // the request scrubber used by the web app is unnecessary here.
    tracesSampleRate: 0,
    sendDefaultPii: false,
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
