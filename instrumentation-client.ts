/**
 * Sentry init for the browser. Next.js loads this module automatically on the
 * client (the App-Router replacement for the old `sentry.client.config.ts`).
 *
 * Only `NEXT_PUBLIC_*` env vars are inlined into the client bundle, so the DSN
 * and environment come from the public variants. Fail-open + error-only, same
 * as the server/edge configs. React render errors are captured explicitly from
 * the `error.tsx` boundaries (they swallow the throw before `window.onerror`).
 */
import * as Sentry from '@sentry/nextjs';
import { sentryBaseOptions } from '@/lib/shared/sentry';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  ...sentryBaseOptions,
});

// App-Router navigation hook the Next SDK expects to be re-exported from this
// file. A no-op while tracing is off (tracesSampleRate 0), but wiring it now
// keeps client instrumentation complete and silences the SDK's build warning.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
