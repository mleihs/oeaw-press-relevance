import Link from 'next/link';
import { Rows, CalendarDays, type LucideIcon } from '@/lib/icons';
import { cn } from '@/lib/shared/utils';
import { buildEventsUrl, type EventsFilterState } from '../_lib/build-events-url';
import type { EventsTab } from '@/lib/server/events/list';
import type { CalendarView } from '../_lib/calendar-range';

/** Tabelle / Kalender segmented control (Toolkit-Redesign.dc.html Z. 364–367):
 *  sits top-right in the events header. „Tabelle" is the list view (no `?view=`),
 *  „Kalender" enters the calendar. Toggling into the calendar keeps whichever
 *  calendar view was last active (week ↔ month) rather than always resetting to
 *  month, and carries the active tab / main-news / list-filters so the mode
 *  switch never drops state. Zero-JS native <Link>s, same pattern as the tabs. */
export function EventsModeSwitcher({
  activeMode,
  tab,
  main,
  calView,
  date,
  filters,
}: {
  activeMode: 'table' | 'calendar';
  tab: EventsTab;
  main: boolean;
  /** The currently-active calendar view, or null in table mode. */
  calView: CalendarView | null;
  date: string | null;
  filters?: EventsFilterState;
}) {
  const items: {
    key: 'table' | 'calendar';
    label: string;
    Icon: LucideIcon;
    href: string;
  }[] = [
    {
      key: 'table',
      label: 'Tabelle',
      Icon: Rows,
      href: buildEventsUrl({ tab, main, ...filters }),
    },
    {
      key: 'calendar',
      label: 'Kalender',
      Icon: CalendarDays,
      href: buildEventsUrl({
        tab,
        main,
        ...filters,
        view: calView ?? 'month',
        date,
      }),
    },
  ];

  return (
    <nav
      aria-label="Darstellung wählen"
      className="bg-muted text-muted-foreground inline-flex h-9 items-center justify-center rounded-lg p-[3px]"
    >
      {items.map(({ key, label, Icon, href }) => {
        const isActive = key === activeMode;
        return (
          <Link
            key={key}
            href={href}
            replace
            scroll={false}
            prefetch={false}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex h-[calc(100%-1px)] items-center justify-center gap-1.5 rounded-md border border-transparent px-2.5 py-1',
              'text-sm font-medium whitespace-nowrap transition-all',
              'focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-2 focus-visible:outline-none',
              isActive
                ? 'bg-background text-foreground shadow-sm dark:bg-input/30 dark:border-input dark:text-foreground'
                : 'text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
