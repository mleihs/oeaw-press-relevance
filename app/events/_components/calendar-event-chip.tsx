'use client';

// Notion-Calendar-inspired event chips, mapped to our project palette. Each
// event reads as a soft, band-tinted block with a saturated colour bar down the
// left edge — that bar + tint carry the *relevance band* at a glance (the
// Notion "calendar colour", here = AI relevance). The title leads; the time and
// the exact score sit quietly on a second line; the editorial decision shows as
// a small corner icon. Relevance stays visible (colour + %), just not shouty.
import { Check, Pause, X as XIcon, type LucideIcon } from '@/lib/icons';
import { getScoreBand } from '@/lib/shared/score-utils';
import { cn } from '@/lib/shared/utils';
import type { Decision } from '@/lib/shared/types';
import { readChipData } from '../_lib/to-calendar-event';

type SxEventProp = { calendarEvent: Record<string, unknown> };

/** Band → {left bar, tint background, text colour} for light + dark. */
const BAND = {
  high: {
    bar: 'bg-brand',
    tint: 'bg-brand/10 dark:bg-brand/25',
    text: 'text-brand dark:text-blue-100',
  },
  mid: {
    bar: 'bg-amber-500',
    tint: 'bg-amber-500/10 dark:bg-amber-400/20',
    text: 'text-amber-700 dark:text-amber-200',
  },
  low: {
    bar: 'bg-orange-500',
    tint: 'bg-orange-500/10 dark:bg-orange-400/20',
    text: 'text-orange-700 dark:text-orange-200',
  },
  very_low: {
    bar: 'bg-muted-foreground/40',
    tint: 'bg-muted',
    text: 'text-foreground/70',
  },
  none: {
    bar: 'bg-muted-foreground/30',
    tint: 'bg-muted/60 dark:bg-muted/40',
    text: 'text-muted-foreground',
  },
} as const;

const DECISION: Record<
  Exclude<Decision, 'undecided'>,
  { cls: string; Icon: LucideIcon; label: string }
> = {
  pitch: { cls: 'text-green-600 dark:text-green-400', Icon: Check, label: 'Pitch' },
  hold: { cls: 'text-blue-600 dark:text-blue-400', Icon: Pause, label: 'Hold' },
  skip: { cls: 'text-muted-foreground', Icon: XIcon, label: 'Skip' },
};

function EventChip({
  calendarEvent,
  layout,
}: SxEventProp & { layout: 'month' | 'week' | 'bar' | 'agenda' }) {
  const { title, _score, _analyzed, _decision, _timeLabel } = readChipData(calendarEvent);
  const b = BAND[_analyzed ? getScoreBand(_score) : 'none'];
  const pct = _score === null ? null : `${Math.round(_score * 100)}%`;
  const dec = _decision !== 'undecided' ? DECISION[_decision] : null;

  // Schedule-X already wraps every event in a focusable, Enter/Space-activatable
  // `role="button"` element (core.js handleKeyDown → onEventClick), so the chip
  // itself stays presentational — adding role/tabIndex here would create a second
  // tab stop. We only give the wrapper a coherent accessible name: with no
  // aria-label on the chip a screen reader would stitch together the loose title
  // + time + "%" text nodes; this one label reads as a sentence instead.
  const ariaLabel = [
    title,
    _timeLabel,
    pct ? `Relevanz ${pct}` : 'noch nicht bewertet',
    dec ? `Entscheidung: ${dec.label}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const Bar = <span className={cn('absolute inset-y-0 left-0 w-1', b.bar)} aria-hidden />;

  if (layout === 'month') {
    return (
      <div
        className={cn(
          'relative flex w-full cursor-pointer items-center gap-1 overflow-hidden rounded-[5px] py-0.5 pr-1 pl-2 text-2xs leading-tight',
          b.tint,
          b.text,
        )}
        title={title}
        aria-label={ariaLabel}
      >
        {Bar}
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        {pct && (
          <span className="shrink-0 pl-0.5 text-2xs font-semibold opacity-70 tabular-nums">
            {pct}
          </span>
        )}
        {dec && <dec.Icon className={cn('h-2.5 w-2.5 shrink-0', dec.cls)} aria-hidden />}
      </div>
    );
  }

  if (layout === 'week') {
    return (
      <div
        className={cn(
          'relative flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-md py-0.5 pr-1.5 pl-2.5 leading-tight',
          b.tint,
          b.text,
        )}
        title={title}
        aria-label={ariaLabel}
      >
        {Bar}
        {dec && (
          <dec.Icon
            className={cn('absolute top-1 right-1 h-3 w-3', dec.cls)}
            aria-hidden
          />
        )}
        <span className="line-clamp-2 pr-3 text-2xs font-semibold">{title}</span>
        <span className="truncate text-2xs font-medium opacity-70 tabular-nums">
          {_timeLabel}
          {pct && ` · ${pct}`}
        </span>
      </div>
    );
  }

  // bar (week date-grid, multi-day) + agenda — horizontal row
  return (
    <div
      className={cn(
        'relative flex w-full cursor-pointer items-center gap-1.5 overflow-hidden rounded-md py-1 pr-2 pl-2.5 text-2xs leading-tight',
        b.tint,
        b.text,
      )}
      title={title}
      aria-label={ariaLabel}
    >
      {Bar}
      <span className="truncate font-semibold">{title}</span>
      <span className="ml-auto shrink-0 text-2xs font-medium opacity-70 tabular-nums">
        {_timeLabel}
        {pct && ` · ${pct}`}
      </span>
      {dec && (
        <dec.Icon className={cn('h-3 w-3 shrink-0', dec.cls)} aria-hidden />
      )}
    </div>
  );
}

export function MonthGridEventChip({ calendarEvent }: SxEventProp) {
  return <EventChip calendarEvent={calendarEvent} layout="month" />;
}

export function TimeGridEventChip({ calendarEvent }: SxEventProp) {
  return <EventChip calendarEvent={calendarEvent} layout="week" />;
}

export function MonthAgendaEventChip({ calendarEvent }: SxEventProp) {
  return <EventChip calendarEvent={calendarEvent} layout="agenda" />;
}

/** Multi-day / all-day spanning events (week view's date grid). */
export function DateGridEventChip({ calendarEvent }: SxEventProp) {
  return <EventChip calendarEvent={calendarEvent} layout="bar" />;
}
