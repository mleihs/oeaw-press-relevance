/**
 * Next.js boot-time hook. Loaded once when the server starts
 * (`next dev` and `next start`); not invoked during `next build`.
 *
 * Runs `validateEnv()` from `lib/server/env.ts` before the first route
 * handler — every required variable and conditional pair (Supabase URL/key,
 * Gate token/password, MeisterTask token/section, MeisterTask label
 * pair) is checked in one pass. Missing or invalid values exit the
 * process with a numbered list, so Phase-3's cryptic Drizzle stack
 * trace from a missing DATABASE_URL no longer wastes 30 minutes.
 *
 * The dynamic import keeps the validator out of the edge bundle: the
 * `nodejs` runtime guard ensures we only validate during the main
 * server boot, not during middleware-only edge invocations.
 *
 * Sentry: this same boot hook loads the per-runtime Sentry init
 * (`sentry.server.config` / `sentry.edge.config`). Both are fail-open — with
 * no `SENTRY_DSN` the SDK stays disabled — so nothing here depends on Sentry
 * being configured.
 */
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv } = await import('./lib/server/env');
    validateEnv();
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

/**
 * Captures errors that propagate out of the App-Router request pipeline —
 * i.e. uncaught throws in Server Components / RSC rendering / route handlers
 * that never reach our `withApiError` seam (that seam catches and returns a
 * 500, so those are captured manually there instead — no double reporting).
 */
export const onRequestError = Sentry.captureRequestError;
