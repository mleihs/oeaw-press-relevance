'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, type ReactNode } from 'react';

/**
 * QueryClient lives in component state so each browser session gets its own
 * instance — avoiding cross-request cache leaks during SSR/RSC boundary
 * traversal. Per TanStack docs (Next.js App Router setup).
 *
 * Defaults tuned for an internal admin tool, not a high-traffic app:
 *   - staleTime 30s: most lists are reviewed in batches; refetching every
 *     window-focus thrashes the dev experience.
 *   - retry: 1 — network blips happen behind the auth gate, but cascading
 *     retries hide real backend errors.
 *   - refetchOnWindowFocus false: the data this app shows is curated, not
 *     real-time; stale-after-30s + manual invalidation after mutations is
 *     enough.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      )}
    </QueryClientProvider>
  );
}
