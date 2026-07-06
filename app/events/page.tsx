import { CalendarDays } from '@/lib/icons';
import { MobileScreenHeader } from '@/components/mobile-screen-header';
import {
  filtersForEventsTab,
  getEventsOverview,
  getUpcomingInstitutes,
  listEvents,
  listEventsInRange,
} from '@/lib/server/events/list';
import { getCardsForEvents } from '@/lib/server/board';
import { cardDeepLink } from '@/lib/shared/board';
import { SCORE_BAND_HIGH } from '@/lib/shared/constants';
import {
  DEFAULT_EVENTS_SORT,
  isEventsBand,
  isEventsSort,
  isEventsTab,
  type EventsBand,
  type EventsSort,
  type EventsSortOrder,
  type EventsTab,
} from '@/lib/shared/events-filter';
import {
  computeCalendarWindow,
  isCalendarView,
} from './_lib/calendar-range';
import { type EventsFilterState } from './_lib/build-events-url';
import { EventsTabsNav } from './_components/events-tabs-nav';
import { EventsTable } from './_components/events-table';
import { EventsAgenda } from './_components/events-agenda';
import { EventsMobileControls } from './_components/events-mobile-controls';
import { MobileMonthCalendar } from './_components/mobile-month-calendar';
import { buildEventsUrl } from './_lib/build-events-url';
import { EventsModeSwitcher } from './_components/events-mode-switcher';
import { CalendarViewSwitcher } from './_components/calendar-view-switcher';
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

  // „Im Board · Karte öffnen"-Deep-Links für gepitchte Events (Comp Z. 292).
  // Ein Batch-Query statt eines Client-Lookups pro Zeile. Auch für die
  // Wochen-Ansicht: deren Events laufen mobil durch die Agenda (M5), die die
  // Deep-Links in der Aktionsreihe zeigt.
  const boardCardHrefs = new Map<string, string>();
  if (!calWindow || calWindow.view === 'week') {
    const cards = await getCardsForEvents(
      list.events.filter((e) => e.decision === 'pitch').map((e) => e.id),
    );
    for (const [eventId, ref] of cards) {
      boardCardHrefs.set(eventId, cardDeepLink(ref));
    }
  }

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

  // Mobil (M5) gibt es nur Agenda (Liste + Woche) und Kompakt-Monatskalender;
  // der Moduswechsel läuft über dieselben ?view=-URLs wie der Desktop-Switcher.
  const mobileMonth = calWindow?.view === 'month';

  return (
    <>
    {/* Blauer App-Header (M2); Subzeile = Mock-Wortlaut (Z. 423). Außerhalb
        des space-y-Containers, damit der Desktop-Fluss unverändert bleibt. */}
    <MobileScreenHeader
      icon={<CalendarDays size={16} weight="fill" />}
      title="Veranstaltungen"
      sub="Bewerten · pitchen · ins Board"
    />
    <div className="space-y-6">
      {/* Header + Darstellungs-Umschalter (Toolkit-Redesign.dc.html Z. 359–368):
          Titel/Untertitel links, Tabelle|Kalender-Segment oben-rechts. */}
      <div className="hidden gap-4 md:flex md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Veranstaltungen
          </h1>
          <p className="text-muted-foreground text-[13.5px] mt-1.5">
            Bewerten, pitchen, ins Redaktionsboard übernehmen. Eine Entscheidung
            wird zur vorbefüllten Karte.
          </p>
        </div>
        <EventsModeSwitcher
          activeMode={calWindow ? 'calendar' : 'table'}
          tab={activeTab}
          main={includeMainNews}
          calView={calView}
          date={calWindow?.anchor ?? null}
          filters={filters}
        />
      </div>

      {calWindow ? (
        /* KALENDER-Modus (Mock Z. 418–520): Nav + Monat|Woche-Sub-Segment +
           globale Aktionen in einer Reihe, darunter Legende + Kalender. Die
           Entscheidungs-Tabs entfallen hier bewusst wie im Mock — der Kalender
           ist die Überblicks-Ansicht (Band = Füllung, Entscheidung = Rand). */
        <div className="hidden space-y-3 md:block">
          <div className="flex flex-wrap items-center gap-3">
            {calWindow && (
              <CalendarNav
                window={calWindow}
                tab={activeTab}
                main={includeMainNews}
                filters={filters}
              />
            )}
            <CalendarViewSwitcher
              window={calWindow}
              tab={activeTab}
              main={includeMainNews}
              filters={filters}
            />
            <span className="flex-1" />
            <EventAnalyzeModal />
            <RefreshButton lastSync={overview.last_synced} />
          </div>
          {summary && <CalendarLegend summary={summary} />}
          <EventsCalendarLoader
            events={list.events}
            view={calWindow.view}
            anchor={calWindow.anchor}
          />
        </div>
      ) : (
        /* TABELLEN-Modus (Mock Z. 370–415): Entscheidungs-Tabs links, globale
           Aktionen rechts (Main-News/Analysieren/Sync), darunter die
           Filterleiste und die Karten-Liste. */
        <div className="hidden space-y-3 md:block">
          <div className="flex flex-wrap items-center gap-3">
            <EventsTabsNav
              activeTab={activeTab}
              stats={overview.stats}
              main={includeMainNews}
              view={null}
              date={null}
              filters={filters}
            />
            <span className="flex-1" />
            <MainNewsToggle showMainNews={includeMainNews} />
            <EventAnalyzeModal />
            <RefreshButton lastSync={overview.last_synced} />
          </div>
          <EventsFilterBar
            q={search}
            band={band}
            institute={institute}
            institutes={institutes}
          />
          <EventsTable rows={list.events} boardCardHrefs={boardCardHrefs} />
        </div>
      )}

      {/* ── Mobile-Layer (M5): Agenda + Kompakt-Monatskalender ── */}
      <div className="space-y-3 md:hidden">
        <EventsMobileControls
          activeTab={activeTab}
          stats={overview.stats}
          main={includeMainNews}
          monthMode={mobileMonth}
          anchor={calWindow?.anchor ?? null}
          filters={filters}
        />
        {mobileMonth && calWindow ? (
          <MobileMonthCalendar
            key={calWindow.anchor}
            events={list.events}
            window={calWindow}
            prevHref={buildEventsUrl({
              tab: activeTab,
              main: includeMainNews,
              ...filters,
              view: 'month',
              date: calWindow.prevAnchor,
            })}
            nextHref={buildEventsUrl({
              tab: activeTab,
              main: includeMainNews,
              ...filters,
              view: 'month',
              date: calWindow.nextAnchor,
            })}
          />
        ) : (
          <EventsAgenda rows={list.events} boardCardHrefs={boardCardHrefs} />
        )}
      </div>
    </div>
    </>
  );
}
