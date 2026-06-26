'use client';

// Install the global Temporal before Schedule-X runs — its core uses a global
// `Temporal` and validates event start/end via `instanceof`, so selectedDate and
// the mapped events must be built from this same global constructor.
import 'temporal-polyfill/global';
import { useCallback, useMemo, useState } from 'react';
import { useTheme } from 'next-themes';
import { useNextCalendarApp, ScheduleXCalendar } from '@schedule-x/react';
import {
  createViewMonthGrid,
  createViewWeek,
  createViewMonthAgenda,
} from '@schedule-x/calendar';
import { createEventsServicePlugin } from '@schedule-x/events-service';
import '@schedule-x/theme-default/dist/index.css';
import './events-calendar.css';
import { toCalendarEvent } from '../_lib/to-calendar-event';
import { CALENDAR_TZ, type CalendarView } from '../_lib/calendar-range';
import {
  MonthGridEventChip,
  TimeGridEventChip,
  MonthAgendaEventChip,
  DateGridEventChip,
} from './calendar-event-chip';
import { CalendarEventModal } from './calendar-event-modal';
import { CalendarSkeleton } from './calendar-skeleton';
import type { Event } from '@/lib/server/events/to-api';

interface Props {
  events: Event[];
  view: CalendarView;
  anchor: string;
}

/** Cheap stable signature of the data that affects rendering (decision border +
 *  score colour), so the calendar remounts and reflects a decision change made
 *  in the modal — which arrives via router.refresh() and would otherwise leave
 *  Schedule-X's already-initialised app showing stale chips. */
function hashEvents(events: Event[]): string {
  let h = 0;
  for (const e of events) {
    const s = `${e.id}${e.decision}${e.event_score ?? ''}${e.analysis_status ?? ''}`;
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  }
  return `${events.length}_${h}`;
}

export function EventsCalendar({ events, view, anchor }: Props) {
  const { resolvedTheme } = useTheme();
  const [selected, setSelected] = useState<Event | null>(null);
  const [open, setOpen] = useState(false);

  const eventsById = useMemo(
    () => new Map(events.map((e) => [e.id, e])),
    [events],
  );

  const onEventClick = useCallback(
    (calendarEvent: { id: string | number }) => {
      const full = eventsById.get(String(calendarEvent.id));
      if (full) {
        setSelected(full);
        setOpen(true);
      }
    },
    [eventsById],
  );

  // The island is ssr:false (no hydration concern); we only wait for next-themes
  // to resolve the theme (undefined on the first client render) so the calendar
  // initialises with the correct isDark instead of flashing the wrong theme.
  if (resolvedTheme === undefined) return <CalendarSkeleton />;

  const dataSig = hashEvents(events);

  return (
    <>
      <CalendarInner
        key={`${view}-${anchor}-${resolvedTheme}-${dataSig}`}
        events={events}
        view={view}
        anchor={anchor}
        isDark={resolvedTheme === 'dark'}
        onEventClick={onEventClick}
      />
      <CalendarEventModal event={selected} open={open} onOpenChange={setOpen} />
    </>
  );
}

function CalendarInner({
  events,
  view,
  anchor,
  isDark,
  onEventClick,
}: Props & {
  isDark: boolean;
  onEventClick: (calendarEvent: { id: string | number }) => void;
}) {
  const sxEvents = useMemo(() => events.map(toCalendarEvent), [events]);

  const calendar = useNextCalendarApp(
    {
      views: [createViewMonthGrid(), createViewWeek(), createViewMonthAgenda()],
      defaultView: view === 'week' ? 'week' : 'month-grid',
      selectedDate: Temporal.PlainDate.from(anchor),
      locale: 'de-DE',
      firstDayOfWeek: 1,
      timezone: CALENDAR_TZ,
      isDark,
      // ÖAW events run daytime/evening — clip the week/day time grid to working
      // hours so it opens on the relevant range instead of empty night hours,
      // and a sane grid height keeps rows from being clipped mid-cell.
      dayBoundaries: { start: '07:00', end: '22:00' },
      weekOptions: { gridHeight: 800 },
      events: sxEvents,
      callbacks: {
        onEventClick: (calendarEvent) =>
          onEventClick(calendarEvent as { id: string | number }),
      },
    },
    [createEventsServicePlugin()],
  );

  if (!calendar) return <CalendarSkeleton />;

  return (
    <div className="sx-events-calendar h-[78vh] min-h-[560px]">
      <ScheduleXCalendar
        calendarApp={calendar}
        customComponents={{
          monthGridEvent: MonthGridEventChip,
          timeGridEvent: TimeGridEventChip,
          monthAgendaEvent: MonthAgendaEventChip,
          dateGridEvent: DateGridEventChip,
        }}
      />
    </div>
  );
}
