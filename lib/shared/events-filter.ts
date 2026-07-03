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
