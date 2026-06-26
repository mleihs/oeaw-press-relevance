// Calendar window math for the events calendar views. Pure + framework-agnostic
// (usable from the RSC page and client components alike). Uses Temporal so the
// month/week grid boundaries are computed in *Vienna civil time* and converted
// to absolute UTC instants for the timestamptz SQL comparison — computing the
// window with plain JS Date would anchor it to the server's TZ (UTC on Vercel),
// shifting month edges by the Vienna offset and mis-including boundary events.
//
// The events table mirrors Austrian event listings, so Europe/Vienna is the
// single civil timezone the whole calendar reasons in (same TZ the de-AT
// Intl formatters in event-format.ts render against).
import { Temporal } from 'temporal-polyfill';

export const CALENDAR_TZ = 'Europe/Vienna';

export const CALENDAR_VIEW_VALUES = ['week', 'month'] as const;
export type CalendarView = (typeof CALENDAR_VIEW_VALUES)[number];

export function isCalendarView(v: unknown): v is CalendarView {
  return (
    typeof v === 'string' &&
    (CALENDAR_VIEW_VALUES as readonly string[]).includes(v)
  );
}

export interface CalendarWindow {
  view: CalendarView;
  /** Civil anchor date the user is viewing (YYYY-MM-DD). */
  anchor: string;
  /** Inclusive first/last civil day rendered in the grid (YYYY-MM-DD). The
   *  month view pads to full Monday–Sunday weeks, so these can spill into the
   *  adjacent months. */
  gridStart: string;
  gridEnd: string;
  /** Absolute half-open instant bounds for SQL: [fromInstant, toInstant).
   *  UTC ISO strings (Vienna-midnight of gridStart .. Vienna-midnight after
   *  gridEnd). */
  fromInstant: string;
  toInstant: string;
  /** Navigation anchors (YYYY-MM-DD) for the prev / next / today links. */
  prevAnchor: string;
  nextAnchor: string;
  todayAnchor: string;
  /** True when the visible grid contains today. */
  containsToday: boolean;
}

/** Monday-based start of the ISO week containing `d` (dayOfWeek: 1=Mon..7=Sun). */
function startOfWeekMonday(d: Temporal.PlainDate): Temporal.PlainDate {
  return d.subtract({ days: d.dayOfWeek - 1 });
}

/** Sunday-based end of the ISO week containing `d`. */
function endOfWeekSunday(d: Temporal.PlainDate): Temporal.PlainDate {
  return d.add({ days: 7 - d.dayOfWeek });
}

function parseAnchor(raw: string | undefined | null): Temporal.PlainDate {
  if (raw) {
    try {
      return Temporal.PlainDate.from(raw);
    } catch {
      // Malformed ?date= → fall back to today rather than 500.
    }
  }
  return Temporal.Now.plainDateISO(CALENDAR_TZ);
}

/** Midnight (Vienna) of a civil day as a UTC instant ISO string. Midnight is
 *  DST-safe in Vienna (transitions happen at 02:00/03:00, never 00:00). */
function viennaMidnightInstant(d: Temporal.PlainDate): string {
  return d.toZonedDateTime({ timeZone: CALENDAR_TZ }).toInstant().toString();
}

/** Computes the visible grid and the absolute instant window for a calendar
 *  view anchored on `rawAnchor` (defaults to today in Vienna). */
export function computeCalendarWindow(
  view: CalendarView,
  rawAnchor?: string | null,
): CalendarWindow {
  const anchor = parseAnchor(rawAnchor);
  const today = Temporal.Now.plainDateISO(CALENDAR_TZ);

  let gridStart: Temporal.PlainDate;
  let gridEnd: Temporal.PlainDate;
  let prev: Temporal.PlainDate;
  let next: Temporal.PlainDate;

  if (view === 'week') {
    gridStart = startOfWeekMonday(anchor);
    gridEnd = endOfWeekSunday(anchor);
    prev = anchor.subtract({ weeks: 1 });
    next = anchor.add({ weeks: 1 });
  } else {
    const firstOfMonth = anchor.with({ day: 1 });
    const lastOfMonth = anchor.with({ day: anchor.daysInMonth });
    gridStart = startOfWeekMonday(firstOfMonth);
    gridEnd = endOfWeekSunday(lastOfMonth);
    prev = firstOfMonth.subtract({ months: 1 });
    next = firstOfMonth.add({ months: 1 });
  }

  return {
    view,
    anchor: anchor.toString(),
    gridStart: gridStart.toString(),
    gridEnd: gridEnd.toString(),
    fromInstant: viennaMidnightInstant(gridStart),
    toInstant: viennaMidnightInstant(gridEnd.add({ days: 1 })),
    prevAnchor: prev.toString(),
    nextAnchor: next.toString(),
    todayAnchor: today.toString(),
    containsToday:
      Temporal.PlainDate.compare(today, gridStart) >= 0 &&
      Temporal.PlainDate.compare(today, gridEnd) <= 0,
  };
}
