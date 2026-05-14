// Isomorphic dashboard constants — shared between the RSC page
// (`app/page.tsx`), the server fetcher (`lib/server/dashboard/fetch.ts`), and
// the client subtree (`app/_components/dashboard-client.tsx`). Lives in
// `lib/shared` so the client can import the value `DASHBOARD_PERIODS` (and
// the type guard) without pulling the `lib/server/dashboard/fetch.ts` module
// — which transitively imports `postgres` and `drizzle-orm` and would
// otherwise fail the RSC → Client boundary check.

export const DASHBOARD_PERIODS = ['week', 'month', 'year', 'all'] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export function isDashboardPeriod(value: unknown): value is DashboardPeriod {
  return (
    typeof value === 'string'
    && (DASHBOARD_PERIODS as readonly string[]).includes(value)
  );
}

// Top-Publikationen-Panel limits — single source of truth across the URL
// parser (`app/page.tsx`), the server fetcher (`lib/server/dashboard/fetch.ts`)
// and the „Mehr laden" button (`dashboard-client.tsx`). The button label
// quotes TOP_PUBS_STEP literally, so any drift between the three constants
// would show as „Mehr laden (20 weitere)" but actually fetch a different
// page-size — keeping them together prevents that.
export const TOP_PUBS_DEFAULT = 20;
export const TOP_PUBS_STEP = 20;
export const TOP_PUBS_MAX = 200;

export function parseTopPubsLimit(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = value ? Number.parseInt(value, 10) : NaN;
  if (Number.isNaN(n) || n <= 0) return TOP_PUBS_DEFAULT;
  return Math.min(n, TOP_PUBS_MAX);
}
