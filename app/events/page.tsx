import { CalendarDays } from 'lucide-react';
import {
  DEFAULT_EVENTS_SORT,
  EVENTS_SORT_VALUES,
  filtersForEventsTab,
  getEventsOverview,
  getUpcomingInstitutes,
  isEventsSort,
  isEventsTab,
  listEvents,
  listEventsInRange,
  type EventsSort,
  type EventsSortOrder,
  type EventsTab,
} from '@/lib/server/events/list';
import { SCORE_BAND_HIGH } from '@/lib/shared/constants';
import { isEventsBand, type EventsBand } from '@/lib/shared/events-filter';
import {
  computeCalendarWindow,
  isCalendarView,
} from './_lib/calendar-range';
import { buildEventsUrl, type EventsFilterState } from './_lib/build-events-url';
import { EventsTabsNav } from './_components/events-tabs-nav';
import { EventsTable } from './_components/events-table';
import { EventsViewSwitcher } from './_components/events-view-switcher';
import { EventsFilterBar } from './_components/events-filter-bar';
import { CalendarNav } from './_components/calendar-nav';
import { CalendarLegend, type CalendarSummary } from './_components/calendar-legend';
import { EventsCalendarLoader } from './_components/events-calendar-loader';
import { RefreshButton } from './_components/refresh-button';
import { MainNewsToggle } from './_components/main-news-toggle';
import { EventAnalyzeModal } from './_components/event-analyze-modal';

// Force-dynamic per ADR 0009: the page has per-row maintainer state
// (decision badges, flag-popovers) that mutates and must reflect immediately,
// not after a 60-second ISR window.
export const dynamic = 'force-dynamic';

// Pre-computes the toggle href for each sortable column (functions can't cross
// the RSC → Client boundary). Same column → flip order; new column → asc.
// `tab` and `main` are preserved so a sort never resets the active view. Sorting
// only applies to the list, so these intentionally omit the calendar `view`.
function buildSortHrefs(
  activeTab: EventsTab,
  includeMainNews: boolean,
  sort: EventsSort,
  order: EventsSortOrder,
  filters: EventsFilterState,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const col of EVENTS_SORT_VALUES) {
    const next: EventsSortOrder =
      sort === col ? (order === 'asc' ? 'desc' : 'asc') : 'asc';
    out[col] = buildEventsUrl({
      tab: activeTab,
      main: includeMainNews,
      ...filters,
      sort: col,
      order: next,
    });
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
    view?: string | string[];
    date?: string | string[];
    q?: string | string[];
    band?: string | string[];
    institute?: string | string[];
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

  // List filters (item F). Composed into both the list and the calendar via
  // `filterOpts`, and carried across every nav surface via `filters`.
  const qRaw = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const search = typeof qRaw === 'string' ? qRaw.trim().slice(0, 100) : '';
  const bandRaw = Array.isArray(sp.band) ? sp.band[0] : sp.band;
  const band: EventsBand | null = isEventsBand(bandRaw) ? bandRaw : null;
  const instRaw = Array.isArray(sp.institute) ? sp.institute[0] : sp.institute;
  const institute = typeof instRaw === 'string' && instRaw ? instRaw : null;

  const filterOpts = {
    includeMainNews,
    search: search || undefined,
    band: band ?? undefined,
    institute: institute ?? undefined,
  };
  const filters: EventsFilterState = { q: search || null, band, institute };

  // View: list (default) | week | month. The calendar views swap the list's
  // open-ended `>= NOW()` for the visible month/week window (?date= anchors it).
  const viewRaw = Array.isArray(sp.view) ? sp.view[0] : sp.view;
  const dateRaw = Array.isArray(sp.date) ? sp.date[0] : sp.date;
  const calView = isCalendarView(viewRaw) ? viewRaw : null;
  const calWindow = calView ? computeCalendarWindow(calView, dateRaw) : null;

  const [overview, institutes, list] = await Promise.all([
    getEventsOverview({ includeMainNews }),
    getUpcomingInstitutes({ includeMainNews }),
    calWindow
      ? listEventsInRange(calWindow, activeTab, filterOpts)
      : listEvents(filtersForEventsTab(activeTab, filterOpts), {
          by: sortBy,
          order: sortOrder,
        }),
  ]);

  const sortHrefs = buildSortHrefs(activeTab, includeMainNews, sortBy, sortOrder, filters);

  const summary: CalendarSummary | null = calWindow
    ? {
        total: list.events.length,
        high: list.events.filter(
          (e) =>
            e.analysis_status === 'analyzed' &&
            e.event_score !== null &&
            e.event_score >= SCORE_BAND_HIGH,
        ).length,
        unscored: list.events.filter(
          (e) => !(e.analysis_status === 'analyzed' && e.event_score !== null),
        ).length,
        undecided: list.events.filter((e) => e.decision === 'undecided').length,
      }
    : null;

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
        <EventsTabsNav
          activeTab={activeTab}
          stats={overview.stats}
          main={includeMainNews}
          view={calView}
          date={calWindow?.anchor ?? null}
          filters={filters}
        />
        <div className="flex items-center gap-4">
          <MainNewsToggle showMainNews={includeMainNews} />
          <EventAnalyzeModal />
          <RefreshButton lastSync={overview.last_synced} />
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <EventsViewSwitcher
          activeView={calView ?? 'list'}
          tab={activeTab}
          main={includeMainNews}
          date={calWindow?.anchor ?? null}
          filters={filters}
        />
        {calWindow && (
          <CalendarNav
            window={calWindow}
            tab={activeTab}
            main={includeMainNews}
            filters={filters}
          />
        )}
      </div>

      <EventsFilterBar
        q={search}
        band={band}
        institute={institute}
        institutes={institutes}
      />

      {calWindow ? (
        <div className="space-y-3">
          {summary && <CalendarLegend summary={summary} />}
          <EventsCalendarLoader
            events={list.events}
            view={calWindow.view}
            anchor={calWindow.anchor}
          />
        </div>
      ) : (
        <EventsTable
          rows={list.events}
          sortBy={sortBy}
          sortOrder={sortOrder}
          sortHrefs={sortHrefs}
        />
      )}
    </div>
  );
}
