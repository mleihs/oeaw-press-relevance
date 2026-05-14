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

// Press-Similarity histogram X-axis range. SPECTER2 cosine between two
// scientific abstracts is naturally clustered in the upper band even for
// thematically unrelated papers (min ≈ 0.80, max ≈ 0.95 on the live
// dataset). A [0..1] X-axis would clump every bucket against the right
// edge — zoom into [0.70..1.00] to show the actual shape. 0.70 is also
// the project's `PRESS_SIMILARITY_BAND_MID` threshold, so the lower edge
// is meaningful, not arbitrary.
export const SIMILARITY_RANGE_MIN = 0.70;
export const SIMILARITY_RANGE_MAX = 1.00;

export function parseTopPubsLimit(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = value ? Number.parseInt(value, 10) : NaN;
  if (Number.isNaN(n) || n <= 0) return TOP_PUBS_DEFAULT;
  return Math.min(n, TOP_PUBS_MAX);
}
