import { and, asc, eq, gte, sql, type SQL } from 'drizzle-orm';
import { db, events as eventsTable } from '@/lib/server/db';
import { eventRowToApi, type Event } from './to-api';

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

/** Baseline: only upcoming events. Every tab and every stat counter is
 *  scoped through this so a row with `event_at` in the past is invisible
 *  everywhere (and won't show up in the badge total). */
function upcomingFilter(): SQL {
  return gte(eventsTable.eventAt, sql`NOW()`);
}

export function filtersForEventsTab(tab: EventsTab): SQL {
  const base = upcomingFilter();
  if (tab === 'upcoming') return base;
  return and(base, eq(eventsTable.decision, tab))!;
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

export async function getEventsOverview(): Promise<EventsOverview> {
  const upcomingExpr = sql`event_at >= NOW()`;
  const filterUpcoming = (extra?: ReturnType<typeof sql>) =>
    extra
      ? sql<number>`COUNT(*) FILTER (WHERE ${upcomingExpr} AND ${extra})::int`
      : sql<number>`COUNT(*) FILTER (WHERE ${upcomingExpr})::int`;

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

export interface EventsListResult {
  events: Event[];
  total: number;
}

export async function listEvents(filter: SQL): Promise<EventsListResult> {
  const rows = await db
    .select()
    .from(eventsTable)
    .where(filter)
    .orderBy(asc(eventsTable.eventAt));
  return { events: rows.map(eventRowToApi), total: rows.length };
}
