import Link from 'next/link';
import { CalendarRange, ListTree, Star } from '@/lib/icons';
import { cn } from '@/lib/shared/utils';
import { buildEventsUrl, type EventsFilterState } from '../_lib/build-events-url';
import { type EventsStats } from '@/lib/server/events/list';
import {
  EVENTS_TAB_VALUES,
  type EventsTab,
} from '@/lib/shared/events-filter';

// Kurzlabels für die schmalen Mobile-Chips (Desktop-Pendant: EventsTabsNav).
const TAB_LABELS: Record<EventsTab, string> = {
  upcoming: 'Alle',
  undecided: 'Offen',
  pitch: 'Übernommen',
  hold: 'Warten',
  skip: 'Verworfen',
};

/**
 * Mobile-Kopfzeile der Events-Ansicht (M5, Mock Board-Mobile Z. 427–441):
 * Segment Agenda|Kalender, im Agenda-Modus darunter die Entscheidungs-Chips
 * (x-scroll im M3/M4-Bleed-Muster) + Main-News-Stern. Alles Zero-JS-Links
 * über buildEventsUrl — derselbe URL-State wie die Desktop-Navigation.
 *
 * Abweichung vom Mock (vetobar): statt „Kommend|Vergangen" (kein Past-Tab im
 * Backend — die Liste ist immer zukünftig) laufen hier die fünf bestehenden
 * Entscheidungs-Tabs als Chips.
 */
export function EventsMobileControls({
  activeTab,
  stats,
  main,
  monthMode,
  anchor,
  filters,
}: {
  activeTab: EventsTab;
  stats: EventsStats;
  main: boolean;
  /** True, wenn mobil der Kompakt-Monatskalender aktiv ist (?view=month). */
  monthMode: boolean;
  /** Kalender-Anker (?date=), damit der Moduswechsel den Monat behält. */
  anchor: string | null;
  filters: EventsFilterState;
}) {
  const segBase =
    'inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors';
  const segActive = 'bg-surface text-brand shadow-[0_1px_2px_rgba(16,32,46,.1)]';
  const segIdle = 'text-ink-subtle';

  return (
    <div className="space-y-2.5">
      <div className="flex gap-[3px] rounded-[10px] bg-fill p-[3px]">
        <Link
          href={buildEventsUrl({ tab: activeTab, main, ...filters })}
          replace
          scroll={false}
          prefetch={false}
          aria-current={!monthMode ? 'page' : undefined}
          className={cn(segBase, !monthMode ? segActive : segIdle)}
        >
          <ListTree className="h-3.5 w-3.5" />
          Agenda
        </Link>
        <Link
          href={buildEventsUrl({
            tab: activeTab,
            main,
            ...filters,
            view: 'month',
            date: anchor,
          })}
          replace
          scroll={false}
          prefetch={false}
          aria-current={monthMode ? 'page' : undefined}
          className={cn(segBase, monthMode ? segActive : segIdle)}
        >
          <CalendarRange className="h-3.5 w-3.5" />
          Kalender
        </Link>
      </div>

      {!monthMode && (
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max items-center gap-[7px]">
            {EVENTS_TAB_VALUES.map((tab) => {
              const active = tab === activeTab;
              return (
                <Link
                  key={tab}
                  href={buildEventsUrl({ tab, main, ...filters })}
                  replace
                  scroll={false}
                  prefetch={false}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] border px-3 text-xs font-semibold transition-colors',
                    active
                      ? 'border-brand bg-brand-50 text-brand'
                      : 'border-line-strong bg-surface text-ink-subtle',
                  )}
                >
                  {TAB_LABELS[tab]}
                  <span
                    className={cn(
                      'rounded-full px-[7px] py-px font-mono text-2xs font-medium',
                      active ? 'bg-brand/10 text-brand' : 'bg-fill text-ink-muted',
                    )}
                  >
                    {stats[tab]}
                  </span>
                </Link>
              );
            })}
            <Link
              href={buildEventsUrl({ tab: activeTab, main: !main, ...filters })}
              replace
              scroll={false}
              prefetch={false}
              title="Events aus dem News-Ordner der ÖAW-Hauptseite (OEAW - Home) einblenden"
              className={cn(
                'inline-flex h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] border px-3 text-xs font-semibold transition-colors',
                main
                  ? 'border-brand bg-brand text-white'
                  : 'border-line-strong bg-surface text-ink-subtle',
              )}
            >
              <Star weight="fill" className="h-[13px] w-[13px]" />
              Main News
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
