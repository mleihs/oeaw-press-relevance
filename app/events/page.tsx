import { CalendarDays } from 'lucide-react';
import {
  filtersForEventsTab,
  getEventsOverview,
  isEventsTab,
  listEvents,
  type EventsTab,
} from '@/lib/server/events/list';
import { EventsTabsNav } from './_components/events-tabs-nav';
import { EventsTable } from './_components/events-table';
import { RefreshButton } from './_components/refresh-button';

// Force-dynamic per ADR 0009: the page has per-row maintainer state
// (decision badges, flag-popovers) that mutates and must reflect immediately,
// not after a 60-second ISR window.
export const dynamic = 'force-dynamic';

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const activeTab: EventsTab = isEventsTab(raw) ? raw : 'upcoming';

  const [overview, list] = await Promise.all([
    getEventsOverview(),
    listEvents(filtersForEventsTab(activeTab)),
  ]);

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
        <RefreshButton lastSync={overview.last_synced} />
      </div>

      <EventsTable rows={list.events} />
    </div>
  );
}
