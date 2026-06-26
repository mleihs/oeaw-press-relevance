// Maps the events DTO → Schedule-X calendar events. Runs client-side (in the
// calendar island), but the conversion is pure so it lives in _lib.
//
// Schedule-X v4 events take Temporal start/end. We build Temporal.ZonedDateTime
// in Europe/Vienna from the timestamptz ISO string so the event lands on the
// correct civil day/time regardless of where the code runs. Fields the custom
// chip needs are stashed as `_`-prefixed keys (CalendarEventExternal carries an
// index signature) rather than relied upon through object identity, since
// Schedule-X clones externals into its internal representation.
// Use the GLOBAL Temporal (not the named import): Schedule-X's core references a
// bare/global `Temporal` and validates events with `instanceof
// Temporal.ZonedDateTime`. Creating events from a separately-imported polyfill
// instance fails that check ("Event start time needs to be a
// Temporal.ZonedDateTime"). Installing the global polyfill makes our instances
// share Schedule-X's constructor.
import 'temporal-polyfill/global';
import type { Event } from '@/lib/server/events/to-api';
import type { Decision } from '@/lib/shared/types';
import { CALENDAR_TZ } from './calendar-range';

export interface CalendarChipData {
  id: string;
  title: string;
  /** 0..1 relevance, or null when not analyzed. */
  _score: number | null;
  _analyzed: boolean;
  _decision: Decision;
  /** Pre-formatted HH:MM in Vienna civil time (derived from the ZonedDateTime,
   *  so it never depends on the renderer's timezone). */
  _timeLabel: string;
}

export interface SxCalendarEvent extends CalendarChipData {
  start: Temporal.ZonedDateTime;
  end: Temporal.ZonedDateTime;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

function toViennaZdt(iso: string): Temporal.ZonedDateTime {
  return Temporal.Instant.from(iso).toZonedDateTimeISO(CALENDAR_TZ);
}

function hhmm(zdt: Temporal.ZonedDateTime): string {
  return `${String(zdt.hour).padStart(2, '0')}:${String(zdt.minute).padStart(2, '0')}`;
}

export function toCalendarEvent(e: Event): SxCalendarEvent {
  const start = toViennaZdt(e.event_at);
  // No end (or a non-positive span) → give the event a 1h slot so it occupies a
  // sane block in the week/time grid; the month grid ignores duration anyway.
  let end = e.event_end_at ? toViennaZdt(e.event_end_at) : start.add({ hours: 1 });
  if (Temporal.ZonedDateTime.compare(end, start) <= 0) {
    end = start.add({ hours: 1 });
  }
  const analyzed = e.analysis_status === 'analyzed' && e.event_score !== null;
  return {
    id: e.id,
    title: e.title,
    start,
    end,
    _score: analyzed ? e.event_score : null,
    _analyzed: analyzed,
    _decision: e.decision,
    _timeLabel: hhmm(start),
  };
}

/** Defensive accessor for the stashed chip fields off a Schedule-X event (which
 *  is loosely typed across the Preact↔React custom-component bridge). */
export function readChipData(ev: Record<string, unknown>): CalendarChipData {
  return {
    id: String(ev.id ?? ''),
    title: typeof ev.title === 'string' ? ev.title : '',
    _score: typeof ev._score === 'number' ? ev._score : null,
    _analyzed: ev._analyzed === true,
    _decision: (ev._decision as Decision) ?? 'undecided',
    _timeLabel: typeof ev._timeLabel === 'string' ? ev._timeLabel : '',
  };
}
