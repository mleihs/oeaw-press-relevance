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

/**
 * One [press_score, press_similarity] pair (both raw 0..1) for the joint
 * dashboard scatter. Isomorphic on purpose: the server fetcher produces it
 * and the client chart consumes it, so it lives here rather than in
 * lib/server (a client import of the server module would pull postgres).
 */
export type ScoreSimilarityPoint = [number, number];

export function parseTopPubsLimit(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = value ? Number.parseInt(value, 10) : NaN;
  if (Number.isNaN(n) || n <= 0) return TOP_PUBS_DEFAULT;
  return Math.min(n, TOP_PUBS_MAX);
}

// Top-Pubs sort order. The dashboard radar's click-to-sort interaction
// flips this between `score` (the press_score weighted aggregate, default)
// and one of the five raw LLM dimensions. Lives in shared so both the
// URL parser (`app/page.tsx`) and the client subtree speak the same
// strings without each side knowing the DB column names.
export const DIMENSION_SORT_MAP = {
  accessibility: 'public_accessibility',
  relevance:     'societal_relevance',
  novelty:       'novelty_factor',
  storytelling:  'storytelling_potential',
  timeliness:    'media_timeliness',
} as const;

export type DimensionSortKey = keyof typeof DIMENSION_SORT_MAP;
export type DimensionDbKey  = (typeof DIMENSION_SORT_MAP)[DimensionSortKey];
export type SortBy           = 'score' | DimensionSortKey;

export const DIMENSION_SORT_KEYS = Object.keys(DIMENSION_SORT_MAP) as DimensionSortKey[];
export const DIMENSION_DB_KEYS   = Object.values(DIMENSION_SORT_MAP) as DimensionDbKey[];

export function isSortBy(value: unknown): value is SortBy {
  if (value === 'score') return true;
  return typeof value === 'string' && value in DIMENSION_SORT_MAP;
}

export function parseSortBy(raw: string | string[] | undefined): SortBy {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isSortBy(value) ? value : 'score';
}

// Reverse map: DB column name → URL short key. Typed with DimensionDbKey on
// both sides so a stray (non-dimension) string can't sneak in at compile time.
// The radar's tick component receives the DB-column name and uses this to
// dispatch the URL navigation in short-key form.
export const DBKEY_TO_SORT_KEY: Record<DimensionDbKey, DimensionSortKey> = Object.fromEntries(
  Object.entries(DIMENSION_SORT_MAP).map(([k, v]) => [v, k]),
) as Record<DimensionDbKey, DimensionSortKey>;

// German display labels for the heading pill and the per-pub badge when
// the sort is active.
export const SORT_BY_LABELS: Record<SortBy, string> = {
  score:         'Story Score',
  accessibility: 'Verständlichkeit',
  relevance:     'Gesellschaftliche Relevanz',
  novelty:       'Neuheit',
  storytelling:  'Erzählpotenzial',
  timeliness:    'Aktualität',
};

/**
 * Build a dashboard URL preserving all non-default params. The period tabs,
 * the „Mehr laden" link, and the radar's sort-toggle all route through here
 * so changing one dimension doesn't silently reset the others.
 */
export function buildDashboardHref(params: {
  period: DashboardPeriod;
  topPubs: number;
  sortBy: SortBy;
}): string {
  const sp = new URLSearchParams();
  if (params.period !== 'month') sp.set('period', params.period);
  if (params.topPubs !== TOP_PUBS_DEFAULT) sp.set('topPubs', String(params.topPubs));
  if (params.sortBy !== 'score') sp.set('sortBy', params.sortBy);
  const qs = sp.toString();
  return qs ? `/?${qs}` : '/';
}
