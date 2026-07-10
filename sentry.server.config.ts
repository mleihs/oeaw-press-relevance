/**
 * Sentry init for the Node.js server runtime. Loaded once from
 * `instrumentation.ts` `register()` when `NEXT_RUNTIME === 'nodejs'`.
 *
 * Fail-open: with no `SENTRY_DSN` the SDK initialises disabled and every
 * `captureException` is a no-op, so local dev and CI need no Sentry account.
 * Error-monitoring only — the shared base sets tracesSampleRate 0 and the
 * secret scrubber (lib/shared/sentry.ts).
 */
import * as Sentry from '@sentry/nextjs';
import { sentryBaseOptions } from '@/lib/shared/sentry';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA,
  ...sentryBaseOptions,
});
