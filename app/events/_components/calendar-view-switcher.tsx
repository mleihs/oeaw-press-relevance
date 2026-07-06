import Link from 'next/link';
import { cn } from '@/lib/shared/utils';
import { buildEventsUrl, type EventsFilterState } from '../_lib/build-events-url';
import type { EventsTab } from '@/lib/shared/events-filter';
import type { CalendarView, CalendarWindow } from '../_lib/calendar-range';

/** Monat / Woche sub-segment for the calendar (Toolkit-Redesign.dc.html
 *  Z. 426–429): sits next to the prev/today/next nav while a calendar view is
 *  active. Switching keeps the same point in time (`date`) plus tab / main /
 *  list-filters, so month ↔ week never jumps back to today. */
export function CalendarViewSwitcher({
  window: win,
  tab,
  main,
  filters,
}: {
  window: CalendarWindow;
  tab: EventsTab;
  main: boolean;
  filters?: EventsFilterState;
}) {
  const items: { key: CalendarView; label: string }[] = [
    { key: 'month', label: 'Monat' },
    { key: 'week', label: 'Woche' },
  ];

  return (
    <nav
      aria-label="Kalender-Ansicht wählen"
      className="bg-muted text-muted-foreground inline-flex h-9 items-center justify-center rounded-lg p-[3px]"
    >
      {items.map(({ key, label }) => {
        const isActive = key === win.view;
        return (
          <Link
            key={key}
            href={buildEventsUrl({
              tab,
              main,
              ...filters,
              view: key,
              date: win.anchor,
            })}
            replace
            scroll={false}
            prefetch={false}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex h-[calc(100%-1px)] items-center justify-center rounded-md border border-transparent px-3 py-1',
              'text-sm font-medium whitespace-nowrap transition-all',
              'focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-2 focus-visible:outline-none',
              isActive
                ? 'bg-background text-foreground shadow-sm dark:bg-input/30 dark:border-input dark:text-foreground'
                : 'text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground',
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
