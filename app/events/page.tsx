import { CalendarDays } from 'lucide-react';
import {
  DEFAULT_EVENTS_SORT,
  EVENTS_SORT_VALUES,
  filtersForEventsTab,
  getEventsOverview,
  isEventsSort,
  isEventsTab,
  listEvents,
  type EventsSort,
  type EventsSortOrder,
  type EventsTab,
} from '@/lib/server/events/list';
import { EventsTabsNav } from './_components/events-tabs-nav';
import { EventsTable } from './_components/events-table';
import { RefreshButton } from './_components/refresh-button';
import { MainNewsToggle } from './_components/main-news-toggle';
import { EventAnalyzeModal } from './_components/event-analyze-modal';

// Force-dynamic per ADR 0009: the page has per-row maintainer state
// (decision badges, flag-popovers) that mutates and must reflect immediately,
// not after a 60-second ISR window.
export const dynamic = 'force-dynamic';

// Pre-computes the toggle href for each sortable column (functions can't cross
// the RSC → Client boundary). Same column → flip order; new column → asc.
// `tab` and `main` are preserved so a sort never resets the active view.
function buildSortHrefs(
  activeTab: EventsTab,
  includeMainNews: boolean,
  sort: EventsSort,
  order: EventsSortOrder,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const col of EVENTS_SORT_VALUES) {
    const next: EventsSortOrder =
      sort === col ? (order === 'asc' ? 'desc' : 'asc') : 'asc';
    const params = new URLSearchParams();
    if (activeTab !== 'upcoming') params.set('tab', activeTab);
    if (includeMainNews) params.set('main', '1');
    params.set('sort', col);
    params.set('order', next);
    out[col] = `/events?${params.toString()}`;
  }
  return out;
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string | string[];
    main?: string | string[];
    sort?: string | string[];
    order?: string | string[];
  }>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const activeTab: EventsTab = isEventsTab(raw) ? raw : 'upcoming';
  // Main-site news folder hidden by default; `?main=1` opts it back in.
  const includeMainNews = (Array.isArray(sp.main) ? sp.main[0] : sp.main) === '1';

  const sortRaw = Array.isArray(sp.sort) ? sp.sort[0] : sp.sort;
  const orderRaw = Array.isArray(sp.order) ? sp.order[0] : sp.order;
  const sortBy: EventsSort = isEventsSort(sortRaw) ? sortRaw : DEFAULT_EVENTS_SORT.by;
  const sortOrder: EventsSortOrder = orderRaw === 'desc' ? 'desc' : 'asc';

  const [overview, list] = await Promise.all([
    getEventsOverview({ includeMainNews }),
    listEvents(filtersForEventsTab(activeTab, { includeMainNews }), {
      by: sortBy,
      order: sortOrder,
    }),
  ]);

  const sortHrefs = buildSortHrefs(activeTab, includeMainNews, sortBy, sortOrder);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarDays className="h-6 w-6 text-emerald-600" />
          Veranstaltungen
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Zukünftige Events aus der ÖAW-WEBDB (TYPO3-News mit Event-Markierung).
          Liste zur Übernahme in den zentralen Eventkalender.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <EventsTabsNav activeTab={activeTab} stats={overview.stats} />
        <div className="flex items-center gap-4">
          <MainNewsToggle showMainNews={includeMainNews} />
          <EventAnalyzeModal />
          <RefreshButton lastSync={overview.last_synced} />
        </div>
      </div>

      <EventsTable
        rows={list.events}
        sortBy={sortBy}
        sortOrder={sortOrder}
        sortHrefs={sortHrefs}
      />
    </div>
  );
}
