import Link from 'next/link';
import { ChevronLeft, ChevronRight } from '@/lib/icons';
import { buildEventsUrl, type EventsFilterState } from '../_lib/build-events-url';
import type { EventsTab } from '@/lib/server/events/list';
import type { CalendarWindow } from '../_lib/calendar-range';

// UTC-pinned formatters: the anchors are pure civil-date strings (YYYY-MM-DD),
// so we build the Date at UTC midnight and format in UTC to avoid any TZ drift
// in the label (the actual event placement is handled in Vienna time elsewhere).
const monthFmt = new Intl.DateTimeFormat('de-AT', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const dayFmt = new Intl.DateTimeFormat('de-AT', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
const dayYearFmt = new Intl.DateTimeFormat('de-AT', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function ymdToUtcDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function rangeLabel(win: CalendarWindow): string {
  if (win.view === 'month') return monthFmt.format(ymdToUtcDate(win.anchor));
  return `${dayFmt.format(ymdToUtcDate(win.gridStart))} – ${dayYearFmt.format(ymdToUtcDate(win.gridEnd))}`;
}

/** Server-rendered prev / today / next navigation for the calendar. Native
 *  <Link>s that drive the `?date=` param, so navigation is shareable,
 *  reload-safe and animates via the app's cross-document view transition — the
 *  same zero-JS navigation model the rest of /events uses. */
export function CalendarNav({
  window: win,
  tab,
  main,
  filters,
}: {
  window: CalendarWindow;
  tab: EventsTab;
  main: boolean;
  /** List filters (search/band/institute) preserved across prev/next/today. */
  filters?: EventsFilterState;
}) {
  const stepClass =
    'inline-flex h-8 w-8 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

  return (
    <div className="flex items-center gap-2">
      <Link
        href={buildEventsUrl({ tab, main, ...filters, view: win.view, date: win.prevAnchor })}
        replace
        scroll={false}
        prefetch={false}
        aria-label={win.view === 'month' ? 'Vorheriger Monat' : 'Vorherige Woche'}
        className={stepClass}
      >
        <ChevronLeft className="h-4 w-4" />
      </Link>

      <span className="min-w-[11rem] text-center text-base font-semibold capitalize tabular-nums">
        {rangeLabel(win)}
      </span>

      <Link
        href={buildEventsUrl({ tab, main, ...filters, view: win.view, date: win.nextAnchor })}
        replace
        scroll={false}
        prefetch={false}
        aria-label={win.view === 'month' ? 'Nächster Monat' : 'Nächste Woche'}
        className={stepClass}
      >
        <ChevronRight className="h-4 w-4" />
      </Link>

      {win.containsToday ? (
        // Already on today's window — render a genuinely disabled control (no
        // href, out of the tab order) instead of a focusable link that merely
        // looks disabled.
        <span
          aria-disabled="true"
          className="ml-1 inline-flex h-8 items-center rounded-md border bg-background px-3 text-sm font-medium opacity-50"
        >
          Heute
        </span>
      ) : (
        <Link
          href={buildEventsUrl({ tab, main, ...filters, view: win.view, date: win.todayAnchor })}
          replace
          scroll={false}
          prefetch={false}
          className="ml-1 inline-flex h-8 items-center rounded-md border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Heute
        </Link>
      )}
    </div>
  );
}
