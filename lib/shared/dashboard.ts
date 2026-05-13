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
