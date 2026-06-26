'use client';

// Lazy boundary for the calendar. dynamic(ssr:false) keeps the Schedule-X +
// Preact + Temporal client bundle out of the default list view — it's only
// fetched once the reader actually switches to a calendar view. ssr:false is
// allowed here because this is a client component (it is not in the RSC page).
import dynamic from 'next/dynamic';
import { CalendarSkeleton } from './calendar-skeleton';
import type { Event } from '@/lib/server/events/to-api';
import type { CalendarView } from '../_lib/calendar-range';

const EventsCalendar = dynamic(
  () => import('./events-calendar').then((m) => m.EventsCalendar),
  { ssr: false, loading: () => <CalendarSkeleton /> },
);

export function EventsCalendarLoader(props: {
  events: Event[];
  view: CalendarView;
  anchor: string;
}) {
  return <EventsCalendar {...props} />;
}
