import type { EventsTab } from '@/lib/server/events/list';
import type { CalendarView } from './calendar-range';

/** Central /events URL builder so every nav surface (tabs, view switcher,
 *  calendar prev/next) preserves the same state instead of resetting it. The
 *  `upcoming` tab and the list view are the canonical defaults, so they're
 *  emitted as a bare `/events` (no query) — matching EventsTabsNav's existing
 *  clean-URL convention. `date` is only meaningful in a calendar view, so it's
 *  dropped in list mode. Sort/order stay owned by buildSortHrefs (list-only). */
export interface EventsUrlState {
  tab?: EventsTab | null;
  main?: boolean;
  view?: CalendarView | null;
  date?: string | null;
}

export function buildEventsUrl(state: EventsUrlState): string {
  const p = new URLSearchParams();
  if (state.tab && state.tab !== 'upcoming') p.set('tab', state.tab);
  if (state.main) p.set('main', '1');
  if (state.view) {
    p.set('view', state.view);
    if (state.date) p.set('date', state.date);
  }
  const qs = p.toString();
  return qs ? `/events?${qs}` : '/events';
}
