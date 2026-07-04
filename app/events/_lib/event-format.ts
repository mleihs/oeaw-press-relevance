// Shared client-safe formatters for the events feature. Extracted from the
// list and detail components so the de-AT date conventions, timespan logic
// and same-day comparison stay in one place — was duplicated across two
// components before this file landed.

// All event timestamps are timestamptz; pin formatting to Europe/Vienna so the
// rendered day/time is the event's civil time everywhere — independent of the
// viewer's locale and of the server TZ (UTC on Vercel) for RSC-rendered lists.
const EVENT_TZ = 'Europe/Vienna';

export const eventDateFmt = new Intl.DateTimeFormat('de-AT', {
  timeZone: EVENT_TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const eventDateLongFmt = new Intl.DateTimeFormat('de-AT', {
  timeZone: EVENT_TZ,
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

export const eventTimeFmt = new Intl.DateTimeFormat('de-AT', {
  timeZone: EVENT_TZ,
  hour: '2-digit',
  minute: '2-digit',
});

// Day-of-month + short month for the calendar-style date block (Toolkit-Redesign
// events table). Pinned to Europe/Vienna like the other event formatters.
export const eventDayFmt = new Intl.DateTimeFormat('de-AT', {
  timeZone: EVENT_TZ,
  day: 'numeric',
});

export const eventMonFmt = new Intl.DateTimeFormat('de-AT', {
  timeZone: EVENT_TZ,
  month: 'short',
});

/** Civil-day equality (local timezone). Used to collapse same-day end
 *  times to "start – end" instead of a full date range. */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Renders an end-time tail: " – HH:MM" for same-day, " – TT.MM.YYYY, HH:MM"
 *  for multi-day. Returns null when there's no end. */
export function formatEventEndTail(start: Date, end: Date | null): string | null {
  if (!end) return null;
  return isSameLocalDay(start, end)
    ? eventTimeFmt.format(end)
    : eventDateFmt.format(end);
}
