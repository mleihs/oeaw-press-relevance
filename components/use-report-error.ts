'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

/**
 * Single client-side capture point for React error boundaries. Every
 * `error.tsx` / `global-error.tsx` in the app funnels its caught error through
 * this hook so there is exactly one place that decides "a boundary caught an
 * error → report it".
 *
 * Why manual: a React error boundary swallows the render throw before it
 * reaches `window.onerror`, so Sentry's global browser handler never sees it.
 * The `digest` on the error correlates a client report with the matching
 * server-side event when the throw originated in an RSC/Server Component.
 *
 * Fail-open: with no `NEXT_PUBLIC_SENTRY_DSN` the SDK is disabled and this is
 * a no-op.
 */
export function useReportError(error: Error & { digest?: string }): void {
  useEffect(() => {
    Sentry.captureException(error, { tags: { seam: 'error-boundary' } });
  }, [error]);
}
