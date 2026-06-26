'use client';

// Custom Schedule-X event chips. The whole point of the calendar for the press
// desk is that *relevance is visible at a glance*, so the chip itself is the
// score badge: its fill is the score band (reusing getScoreBandClass — the same
// colour language as the table's PressScoreBadge), the score % leads, and the
// editorial decision shows as a left accent border (reusing decisionAccentClass).
// Unanalyzed events render muted + dashed with a "–", so they visibly recede and
// read as "needs scoring".
import { getScoreBandClass } from '@/lib/shared/score-utils';
import { decisionAccentClass } from '@/components/decision-badge';
import { cn } from '@/lib/shared/utils';
import { readChipData } from '../_lib/to-calendar-event';

type SxEventProp = { calendarEvent: Record<string, unknown> };

function scorePct(score: number | null): string {
  return score === null ? '–' : `${Math.round(score * 100)}%`;
}

function EventChip({
  calendarEvent,
  layout,
}: SxEventProp & { layout: 'month' | 'week' | 'agenda' | 'bar' }) {
  const { title, _score, _analyzed, _decision, _timeLabel } = readChipData(calendarEvent);

  const fill = _analyzed
    ? getScoreBandClass(_score, 'badge')
    : 'bg-muted text-muted-foreground border border-dashed border-border';
  const accent = decisionAccentClass(_decision);

  if (layout === 'week') {
    return (
      <div className={cn('flex h-full w-full flex-col gap-0.5 overflow-hidden rounded px-1.5 py-1', fill, accent)}>
        <div className="flex items-baseline gap-1">
          <span className="text-xs font-bold tabular-nums">{scorePct(_score)}</span>
          <span className="text-[10px] opacity-80 tabular-nums">{_timeLabel}</span>
        </div>
        <span className="line-clamp-3 text-[11px] font-medium leading-snug">{title}</span>
      </div>
    );
  }

  if (layout === 'bar') {
    // Multi-day / all-day spanning bar (week view's date grid). Fills the
    // wrapper height, single line, score-led.
    return (
      <div
        className={cn(
          'flex h-full w-full items-center gap-1.5 overflow-hidden rounded px-1.5 text-[11px] leading-tight',
          fill,
          accent,
        )}
        title={title}
      >
        <span className="font-bold tabular-nums">{scorePct(_score)}</span>
        {_timeLabel && <span className="opacity-70 tabular-nums">{_timeLabel}</span>}
        <span className="truncate font-medium">{title}</span>
      </div>
    );
  }

  if (layout === 'agenda') {
    return (
      <div className={cn('flex w-full items-center gap-2 rounded px-2 py-1.5', fill, accent)}>
        <span className="text-xs font-bold tabular-nums">{scorePct(_score)}</span>
        <span className="text-[11px] opacity-80 tabular-nums">{_timeLabel}</span>
        <span className="truncate text-xs font-medium">{title}</span>
      </div>
    );
  }

  // month grid — compact single line, score leads
  return (
    <div
      className={cn(
        'flex w-full items-center gap-1 rounded px-1 py-0.5 text-[11px] leading-tight',
        fill,
        accent,
      )}
      title={title}
    >
      <span className="font-bold tabular-nums">{scorePct(_score)}</span>
      <span className="opacity-70 tabular-nums">{_timeLabel}</span>
      <span className="truncate font-medium">{title}</span>
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

/** Multi-day / all-day spanning events (week view's date grid). Without this the
 *  slot falls back to Schedule-X's default event, which our `.sx__event` reset
 *  strips — leaving bare text. */
export function DateGridEventChip({ calendarEvent }: SxEventProp) {
  return <EventChip calendarEvent={calendarEvent} layout="bar" />;
}
