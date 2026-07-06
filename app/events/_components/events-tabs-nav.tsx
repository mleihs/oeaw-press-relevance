import Link from 'next/link';
import {
  CalendarDays,
  CircleHelp,
  Check,
  Pause,
  X as XIcon,
  type LucideIcon,
} from '@/lib/icons';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/shared/utils';
import { buildEventsUrl, type EventsFilterState } from '../_lib/build-events-url';
import type { CalendarView } from '../_lib/calendar-range';
import { type EventsStats } from '@/lib/server/events/list';
import {
  EVENTS_TAB_VALUES,
  type EventsTab,
} from '@/lib/shared/events-filter';

const TAB_DISPLAY: Record<
  EventsTab,
  { label: string; Icon: LucideIcon; statsKey: keyof EventsStats }
> = {
  upcoming:  { label: 'Alle zukünftig', Icon: CalendarDays, statsKey: 'upcoming'  },
  undecided: { label: 'Offen',          Icon: CircleHelp,   statsKey: 'undecided' },
  pitch:     { label: 'Übernommen',     Icon: Check,        statsKey: 'pitch'     },
  hold:      { label: 'Warten',         Icon: Pause,        statsKey: 'hold'      },
  skip:      { label: 'Verworfen',      Icon: XIcon,        statsKey: 'skip'      },
};

/** URL-driven nav-as-routes (same pattern as PressReleasesTabsNav). The
 *  `upcoming` default tab uses the canonical URL without `?tab=` so links
 *  stay clean. Adding a tab in EVENTS_TAB_VALUES surfaces here as a
 *  Record-completeness TS error — pair-add labels here at the same time. */
export function EventsTabsNav({
  activeTab,
  stats,
  main = false,
  view = null,
  date = null,
  filters,
}: {
  activeTab: EventsTab;
  stats: EventsStats;
  /** Carried through so switching decision tabs preserves the main-news toggle
   *  and the active calendar view/date instead of resetting to the list. */
  main?: boolean;
  view?: CalendarView | null;
  date?: string | null;
  /** List filters (search/band/institute) preserved across a tab switch. */
  filters?: EventsFilterState;
}) {
  return (
    <nav
      aria-label="Veranstaltungen filtern"
      className="bg-muted text-muted-foreground rounded-lg p-[3px] h-9 inline-flex w-full sm:w-auto items-center justify-center"
    >
      {EVENTS_TAB_VALUES.map((value) => {
        const { label, Icon, statsKey } = TAB_DISPLAY[value];
        const isActive = value === activeTab;
        const href = buildEventsUrl({ tab: value, main, ...filters, view, date });
        return (
          <Link
            key={value}
            href={href}
            replace
            scroll={false}
            prefetch={false}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5',
              'h-[calc(100%-1px)] rounded-md border border-transparent px-2 py-1',
              'text-sm font-medium whitespace-nowrap transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isActive
                ? 'bg-background text-foreground shadow-sm dark:bg-input/30 dark:border-input dark:text-foreground'
                : 'text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            <Badge variant="secondary" className="ml-0.5 text-2xs px-1.5 py-0 tabular-nums">
              {stats[statsKey]}
            </Badge>
          </Link>
        );
      })}
    </nav>
  );
}
