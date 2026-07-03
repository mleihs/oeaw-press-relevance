import 'server-only';
import { and, asc, eq, gte, ilike, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import { db, events as eventsTable } from '@/lib/server/db';
import { ascNullsLast, descNullsLast } from '@/lib/server/db/sort';
import { eventListColumns, eventListRowToApi } from './to-api';
import { SCORE_BAND_HIGH, SCORE_BAND_MID } from '@/lib/shared/constants';
import type { EventsBand } from '@/lib/shared/events-filter';
import type { Event } from '@/lib/shared/types';

export const EVENTS_TAB_VALUES = [
  'upcoming',
  'undecided',
  'pitch',
  'hold',
  'skip',
] as const;
export type EventsTab = (typeof EVENTS_TAB_VALUES)[number];

export function isEventsTab(v: unknown): v is EventsTab {
  return (
    typeof v === 'string' &&
    (EVENTS_TAB_VALUES as readonly string[]).includes(v)
  );
}

/** Derived institute label for events that live in the news folder of the
 *  ÖAW main site (vs. an institute / cluster / project folder). The typo3-events
 *  adapter resolves this from the TYPO3 page tree; these are the central-site
 *  announcements the press team usually wants out of the institute view. */
export const MAIN_OEAW_NEWS_INSTITUTE = 'OEAW - Home';

export interface EventsFilterOptions {
  /** Include the main-site news folder (institute = MAIN_OEAW_NEWS_INSTITUTE).
   *  Default false → those events are hidden (the UI toggle opts back in). */
  includeMainNews?: boolean;
  /** Title/teaser substring (ILIKE). Trimmed, wildcard-escaped and length-capped
   *  in searchFilter; an empty/blank string is a no-op. */
  search?: string;
  /** Score-band quick filter (see EVENTS_BAND_VALUES). */
  band?: EventsBand;
  /** Exact institute label (one of getUpcomingInstitutes). */
  institute?: string;
}

/** Baseline: only upcoming events. Every tab and every stat counter is
 *  scoped through this so a row with `event_at` in the past is invisible
 *  everywhere (and won't show up in the badge total). */
function upcomingFilter(): SQL {
  return gte(eventsTable.eventAt, sql`NOW()`);
}

/** Excludes the ÖAW-main-site news folder. `IS DISTINCT FROM` keeps
 *  NULL-institute events (NULL is distinct from the label), so only the
 *  main-homepage folder is filtered out. */
function mainNewsExclusion(): SQL {
  return sql`${eventsTable.institute} IS DISTINCT FROM ${MAIN_OEAW_NEWS_INSTITUTE}`;
}

/** Escapes ILIKE wildcards in user input so a literal `%`/`_` matches itself
 *  (mirrors the publications search layer). */
function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (m) => '\\' + m);
}

/** Title/teaser substring match. Returns null for blank input (a no-op). */
function searchFilter(raw: string): SQL | null {
  const q = raw.trim().slice(0, 100);
  if (!q) return null;
  const pattern = `%${likeEscape(q)}%`;
  // teaser is nullable; ILIKE on NULL is NULL, so the OR falls back to title.
  return or(ilike(eventsTable.title, pattern), ilike(eventsTable.teaser, pattern))!;
}

/** Score-band predicate. high/mid/low gate on `analysis_status = 'analyzed'`
 *  (matching the list's "scored" rule), `unscored` is its complement. Each
 *  fragment is fully parenthesised so it composes safely under the outer AND —
 *  the `unscored` OR would otherwise bind looser than the AND join. */
function bandFilter(band: EventsBand): SQL {
  const score = eventsTable.eventScore;
  const status = eventsTable.analysisStatus;
  switch (band) {
    case 'high':
      return sql`(${status} = 'analyzed' AND ${score} >= ${SCORE_BAND_HIGH})`;
    case 'mid':
      return sql`(${status} = 'analyzed' AND ${score} >= ${SCORE_BAND_MID} AND ${score} < ${SCORE_BAND_HIGH})`;
    case 'low':
      return sql`(${status} = 'analyzed' AND ${score} < ${SCORE_BAND_MID})`;
    case 'unscored':
      return sql`(${status} IS DISTINCT FROM 'analyzed' OR ${score} IS NULL)`;
  }
}

/** Conditions shared by the list and the calendar: decision-tab scoping,
 *  main-news exclusion, and the optional search / band / institute filters. The
 *  base predicate (upcoming vs the visible window) is prepended by each caller,
 *  so the same tabs, toggle and filters drive both surfaces identically. */
function commonEventFilters(tab: EventsTab, opts: EventsFilterOptions): SQL[] {
  const parts: SQL[] = [];
  if (tab !== 'upcoming') parts.push(eq(eventsTable.decision, tab));
  if (!opts.includeMainNews) parts.push(mainNewsExclusion());
  if (opts.search) {
    const s = searchFilter(opts.search);
    if (s) parts.push(s);
  }
  if (opts.band) parts.push(bandFilter(opts.band));
  if (opts.institute) parts.push(eq(eventsTable.institute, opts.institute));
  return parts;
}

export function filtersForEventsTab(
  tab: EventsTab,
  opts: EventsFilterOptions = {},
): SQL {
  return and(upcomingFilter(), ...commonEventFilters(tab, opts))!;
}

/** Absolute half-open instant bounds [from, to) for a calendar view's visible
 *  window. Computed app-side (Vienna civil time → UTC instants, see
 *  app/events/_lib/calendar-range.ts); kept as a plain string pair here so the
 *  server layer never imports app-feature code (boundaries rule). */
export interface EventsCalendarWindow {
  fromInstant: string;
  toInstant: string;
}

/** Events overlapping the calendar's visible instant window. An event overlaps
 *  when it starts before the window ends AND its end — or its start, when it has
 *  no end — is at/after the window start, so a multi-day event spanning into the
 *  window from an earlier month is still shown. The bounds are cast to
 *  timestamptz so Postgres compares them against the timestamptz `event_at`
 *  column regardless of bind-param type inference. */
function eventsInRangeFilter(fromInstant: string, toInstant: string): SQL {
  return sql`${eventsTable.eventAt} < ${toInstant}::timestamptz AND COALESCE(${eventsTable.eventEndAt}, ${eventsTable.eventAt}) >= ${fromInstant}::timestamptz`;
}

/** Calendar-mode filter. The visible instant window replaces the list's
 *  open-ended `event_at >= NOW()`, but the decision-tab scoping and main-news
 *  exclusion compose identically — so the same tabs and toggle that drive the
 *  list also filter the calendar (e.g. "only Pitch events this month"). */
export function filtersForEventsCalendar(
  window: EventsCalendarWindow,
  tab: EventsTab,
  opts: EventsFilterOptions = {},
): SQL {
  return and(
    eventsInRangeFilter(window.fromInstant, window.toInstant),
    ...commonEventFilters(tab, opts),
  )!;
}

export interface EventsStats {
  upcoming: number;
  undecided: number;
  pitch: number;
  hold: number;
  skip: number;
}

/** Single round-trip via Postgres FILTER aggregate (one scan over upcoming
 *  rows, four conditional counts in the SELECT). Trumps five parallel
 *  COUNTs on the wire even when the pooler serialises them, and keeps the
 *  numbers internally consistent: the four decision tallies are guaranteed
 *  to sum to `upcoming` because they share the same WHERE filter and the
 *  same scan. Also gets `last_synced` for free in the same round-trip via
 *  MAX over the full table (`event_at >= NOW()` would hide rows whose
 *  last sync was the *only* signal of liveness — last-sync must consider
 *  every mirrored row, not just upcoming ones). */
export interface EventsOverview {
  stats: EventsStats;
  last_synced: string | null;
}

export async function getEventsOverview(
  opts: EventsFilterOptions = {},
): Promise<EventsOverview> {
  // The tab counts must match the rows the list actually shows, so they share
  // the same main-news exclusion. `last_synced` (below) deliberately spans the
  // whole table — it reports sync liveness, not the filtered view.
  const scope = opts.includeMainNews
    ? sql`event_at >= NOW()`
    : sql`event_at >= NOW() AND ${mainNewsExclusion()}`;
  const filterUpcoming = (extra?: ReturnType<typeof sql>) =>
    extra
      ? sql<number>`COUNT(*) FILTER (WHERE ${scope} AND ${extra})::int`
      : sql<number>`COUNT(*) FILTER (WHERE ${scope})::int`;

  const [row] = await db
    .select({
      upcoming: filterUpcoming(),
      undecided: filterUpcoming(sql`${eventsTable.decision} = 'undecided'`),
      pitch: filterUpcoming(sql`${eventsTable.decision} = 'pitch'`),
      hold: filterUpcoming(sql`${eventsTable.decision} = 'hold'`),
      skip: filterUpcoming(sql`${eventsTable.decision} = 'skip'`),
      lastSynced: sql<string | null>`MAX(${eventsTable.syncedAt})::text`,
    })
    .from(eventsTable);

  return {
    stats: {
      upcoming: row?.upcoming ?? 0,
      undecided: row?.undecided ?? 0,
      pitch: row?.pitch ?? 0,
      hold: row?.hold ?? 0,
      skip: row?.skip ?? 0,
    },
    last_synced: row?.lastSynced
      ? new Date(row.lastSynced).toISOString()
      : null,
  };
}

/** Distinct institute labels among upcoming events, for the filter dropdown.
 *  Respects the main-news toggle (so "OEAW - Home" only appears when opted in)
 *  but deliberately ignores the active tab/search/band/institute — a faceted
 *  filter shows every value you could pick, stable as you navigate. */
export async function getUpcomingInstitutes(
  opts: EventsFilterOptions = {},
): Promise<string[]> {
  const parts: SQL[] = [upcomingFilter(), isNotNull(eventsTable.institute)];
  if (!opts.includeMainNews) parts.push(mainNewsExclusion());
  const rows = await db
    .selectDistinct({ institute: eventsTable.institute })
    .from(eventsTable)
    .where(and(...parts))
    .orderBy(asc(eventsTable.institute));
  return rows
    .map((r) => r.institute)
    .filter((i): i is string => i !== null);
}

export interface EventsListResult {
  events: Event[];
  total: number;
}

/** Sortable list columns. `date` is the default (chronological agenda); `score`
 *  lets the press team surface the most relevant events first. Whitelisted so a
 *  bad `?sort=` query param can't reach the order-by. */
export const EVENTS_SORT_VALUES = ['date', 'score'] as const;
export type EventsSort = (typeof EVENTS_SORT_VALUES)[number];
export type EventsSortOrder = 'asc' | 'desc';

export function isEventsSort(v: unknown): v is EventsSort {
  return (
    typeof v === 'string' &&
    (EVENTS_SORT_VALUES as readonly string[]).includes(v)
  );
}

export interface EventsSortSpec {
  by: EventsSort;
  order: EventsSortOrder;
}

export const DEFAULT_EVENTS_SORT: EventsSortSpec = { by: 'date', order: 'asc' };

export async function listEvents(
  filter: SQL,
  sort: EventsSortSpec = DEFAULT_EVENTS_SORT,
): Promise<EventsListResult> {
  // `event_score` is NULL for not-yet-analyzed events; NULLS LAST keeps those
  // out of the way in both directions. eventAt is a stable secondary key so a
  // score sort doesn't shuffle the many same-score internal seminars randomly.
  const col = sort.by === 'score' ? eventsTable.eventScore : eventsTable.eventAt;
  const primary =
    sort.order === 'asc' ? ascNullsLast(col) : descNullsLast(col);
  // Slim projection (eventListColumns) drops the heavy text fields the list +
  // calendar never render — see to-api.ts. Detail/analyze load the full row.
  const rows = await db
    .select(eventListColumns)
    .from(eventsTable)
    .where(filter)
    .orderBy(primary, asc(eventsTable.eventAt));
  return { events: rows.map(eventListRowToApi), total: rows.length };
}

/** Fetches the events overlapping a calendar window for the active tab. The
 *  calendar positions events by date itself, but a stable chronological order
 *  keeps same-cell stacking deterministic between renders. */
export function listEventsInRange(
  window: EventsCalendarWindow,
  tab: EventsTab,
  opts: EventsFilterOptions = {},
): Promise<EventsListResult> {
  return listEvents(filtersForEventsCalendar(window, tab, opts), {
    by: 'date',
    order: 'asc',
  });
}