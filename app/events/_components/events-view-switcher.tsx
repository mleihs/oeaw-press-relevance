import Link from 'next/link';
import { List, CalendarRange, CalendarDays, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { buildEventsUrl } from '../_lib/build-events-url';
import type { EventsTab } from '@/lib/server/events/list';
import type { CalendarView } from '../_lib/calendar-range';

export type ActiveEventsView = 'list' | CalendarView;

const ITEMS: { key: ActiveEventsView; label: string; Icon: LucideIcon }[] = [
  { key: 'list', label: 'Liste', Icon: List },
  { key: 'week', label: 'Woche', Icon: CalendarRange },
  { key: 'month', label: 'Monat', Icon: CalendarDays },
];

/** Liste / Woche / Monat segmented control. Zero-JS native <Link>s (same
 *  pattern as EventsTabsNav), preserving the active tab + main-news toggle so
 *  the view choice never resets the filter. `date` is carried into the calendar
 *  views so switching week↔month keeps the same point in time. */
export function EventsViewSwitcher({
  activeView,
  tab,
  main,
  date,
}: {
  activeView: ActiveEventsView;
  tab: EventsTab;
  main: boolean;
  date: string | null;
}) {
  return (
    <nav
      aria-label="Ansicht wählen"
      className="bg-muted text-muted-foreground inline-flex h-9 items-center justify-center rounded-lg p-[3px]"
    >
      {ITEMS.map(({ key, label, Icon }) => {
        const href =
          key === 'list'
            ? buildEventsUrl({ tab, main })
            : buildEventsUrl({ tab, main, view: key, date });
        const isActive = key === activeView;
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
