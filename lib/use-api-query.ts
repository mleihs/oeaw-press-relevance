'use client';

import { useQuery, type UseQueryOptions, type QueryKey, keepPreviousData } from '@tanstack/react-query';
import { getApiHeaders } from './settings-store';

/**
 * Wrapper around `useQuery` for the StoryScout JSON API. Resolves three
 * pieces of boilerplate that drifted across migration sites:
 *
 * 1. `getApiHeaders()` is auto-injected — no per-site repetition.
 * 2. API errors that come as 200-with-`{error: "..."}` payloads are
 *    converted to thrown Errors so they land in `error` (instead of
 *    masquerading as `data`). Network errors still pass through.
 * 3. `placeholderData: keepPreviousData` is the default, eliminating the
 *    "Lade …"-flicker when filters or paginated routes change. Pass
 *    `keepPreviousData: false` in opts to opt out (rare).
 *
 * Use this everywhere `useQuery` was being called against a `/api/*`
 * route. Dashboards, lists, detail pages, hooks — all the same shape.
 */
type ApiResponse<T> = T & { error?: string };

interface UseApiQueryOptions<T>
  extends Omit<UseQueryOptions<T, Error, T, QueryKey>, 'queryKey' | 'queryFn' | 'placeholderData'> {
  keepPreviousData?: boolean;
}

export function useApiQuery<T>(
  key: QueryKey,
  url: string,
  opts: UseApiQueryOptions<T> = {},
) {
  const { keepPreviousData: keep = true, ...rest } = opts;
  return useQuery<T, Error>({
    queryKey: key,
    queryFn: async () => {
      const r = await fetch(url, { headers: getApiHeaders() });
      const body = (await r.json()) as ApiResponse<T>;
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      if (body.error) throw new Error(body.error);
      return body as T;
    },
    placeholderData: keep ? keepPreviousData : undefined,
    ...rest,
  });
}
