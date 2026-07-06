import type {
  EventsBand,
  EventsSort,
  EventsSortOrder,
  EventsTab,
} from '@/lib/shared/events-filter';
import type { CalendarView } from './calendar-range';

/** Central /events URL builder so every nav surface (tabs, view switcher,
 *  calendar prev/next, column-sort links) preserves the same state instead of
 *  resetting it. The `upcoming` tab and the list view are the canonical
 *  defaults, so they're emitted as a bare `/events` (no query) — matching
 *  EventsTabsNav's existing clean-URL convention. `date` is only meaningful in a
 *  calendar view, so it's dropped in list mode. `sort`/`order` are list-only and
 *  always emitted together (a sort target is meaningless without its direction). */
export interface EventsUrlState {
  tab?: EventsTab | null;
  main?: boolean;
  /** Title/teaser search. List-filter params (q/band/institute) compose with
   *  the tab + main toggle and are carried across every nav surface. */
  q?: string | null;
  /** Score-band quick filter. */
  band?: EventsBand | null;
  /** Exact institute label. */
  institute?: string | null;
  view?: CalendarView | null;
  date?: string | null;
  sort?: EventsSort | null;
  order?: EventsSortOrder | null;
}

/** The list-filter slice of the URL state, threaded through nav surfaces (tabs,
 *  view switcher, calendar nav, sort headers) so any of them preserves the
 *  active search / band / institute instead of dropping it. */
export type EventsFilterState = Pick<EventsUrlState, 'q' | 'band' | 'institute'>;

export function buildEventsUrl(state: EventsUrlState): string {
  const p = new URLSearchParams();
  if (state.tab && state.tab !== 'upcoming') p.set('tab', state.tab);
  if (state.main) p.set('main', '1');
  if (state.q) p.set('q', state.q);
  if (state.band) p.set('band', state.band);
  if (state.institute) p.set('institute', state.institute);
  if (state.view) {
    p.set('view', state.view);
    if (state.date) p.set('date', state.date);
  }
  if (state.sort && state.order) {
    p.set('sort', state.sort);
    p.set('order', state.order);
  }
  const qs = p.toString();
  return qs ? `/events?${qs}` : '/events';
}
