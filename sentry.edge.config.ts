/**
 * Sentry init for the Edge runtime (middleware / edge routes). Loaded from
 * `instrumentation.ts` `register()` when `NEXT_RUNTIME === 'edge'`. Same
 * fail-open, error-only posture as the server config.
 */
import * as Sentry from '@sentry/nextjs';
import { sentryBaseOptions } from '@/lib/shared/sentry';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA,
  ...sentryBaseOptions,
});
