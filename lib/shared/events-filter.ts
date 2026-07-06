/** Score-band quick filter for the events list — shared between the server
 *  filter layer (lib/server/events/list.ts, which is `server-only`) and the
 *  client filter bar, so the values, validator and labels stay single-sourced
 *  across the server/client boundary. A client component can't import runtime
 *  values from the server-only list module, so they live here. Mirrors the
 *  lib/shared/social-filter.ts split. */

export const EVENTS_BAND_VALUES = ['high', 'mid', 'low', 'unscored'] as const;
export type EventsBand = (typeof EVENTS_BAND_VALUES)[number];

export function isEventsBand(v: unknown): v is EventsBand {
  return (
    typeof v === 'string' &&
    (EVENTS_BAND_VALUES as readonly string[]).includes(v)
  );
}

export const EVENTS_BAND_LABELS: Record<EventsBand, string> = {
  high: 'Hoch',
  mid: 'Mittel',
  low: 'Niedrig',
  unscored: 'Unbewertet',
};

/** Decision-workflow tabs for the events list. Client nav surfaces (tabs,
 *  mobile chips) iterate these values, so they live here rather than in the
 *  `server-only` list module — same rationale as EVENTS_BAND_VALUES above. */
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
