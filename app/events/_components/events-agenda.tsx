import { CalendarX } from '@/lib/icons';
import { MobileEventCard } from './mobile-event-card';
import {
  eventDayKey,
  eventDayMonthLongFmt,
  eventWeekdayShortFmt,
} from '../_lib/event-format';
import type { Event } from '@/lib/shared/types';

interface Props {
  rows: Event[];
  /** eventId → Board-Karten-Deep-Link, nur für gepitchte Events. */
  boardCardHrefs: Map<string, string>;
}

/**
 * Mobile-Agenda (M5, Mock Board-Mobile Z. 443–485): Events gruppiert nach
 * Wiener Kalendertag („Fr · 4. Juli" + Hairline), pro Event eine Karte mit
 * Titel/Venue/Score und full-width Pitchen/Verwerfen darunter. Ersetzt auf
 * < md die Desktop-Tabelle (dort ~200px H-Overflow bei 390px, §M1-Befund).
 * Seit M6b öffnet der Titel-Tap das Detail-Bottom-Sheet (mobile-event-card).
 */
export function EventsAgenda({ rows, boardCardHrefs }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[14px] border-[1.5px] border-dashed border-line-strong px-4 py-[34px] text-center">
        <CalendarX aria-hidden className="mx-auto h-7 w-7 text-line-strong" />
        <div className="mt-2.5 text-[13.5px] text-ink-subtle">
          Keine Veranstaltungen
        </div>
      </div>
    );
  }

  // Immer chronologisch, unabhängig vom Desktop-Sort-Param — die Agenda ist
  // per Definition nach Tagen aufsteigend gruppiert.
  const sorted = [...rows].sort(
    (a, b) => new Date(a.event_at).getTime() - new Date(b.event_at).getTime(),
  );

  const groups: { key: string; day: string; label: string; events: Event[] }[] = [];
  for (const event of sorted) {
    const start = new Date(event.event_at);
    const key = eventDayKey(start);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = {
        key,
        day: eventWeekdayShortFmt.format(start).replace('.', ''),
        label: eventDayMonthLongFmt.format(start),
        events: [],
      };
      groups.push(group);
    }
    group.events.push(event);
  }

  return (
    <div>
      {groups.map((group) => (
        <div key={group.key}>
          <div className="flex items-center gap-2 px-1 pb-[9px] pt-1.5">
            <span className="font-mono text-[11px] font-semibold text-brand">
              {group.day}
            </span>
            <span className="text-[12.5px] font-semibold text-ink-soft">
              {group.label}
            </span>
            <span aria-hidden className="h-px flex-1 bg-line" />
          </div>
          {group.events.map((event) => (
            <MobileEventCard
              key={event.id}
              event={event}
              boardCardHref={boardCardHrefs.get(event.id)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
