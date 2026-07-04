'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, CalendarRange } from '@/lib/icons';
import { cn } from '@/lib/shared/utils';
import {
  AGENDA_BAR,
  AGENDA_CARD,
  AgendaCardHead,
  eventScoreBand,
} from './events-agenda';
import { eventDayKey } from '../_lib/event-format';
import type { CalendarWindow } from '../_lib/calendar-range';
import type { ScoreBand } from '@/lib/shared/score-utils';
import type { Event } from '@/lib/shared/types';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Punkt-Marker-Farbe je Score-Band (Mock `evBand.bar` als bg-Variante des
 *  Agenda-Akzentbalkens). Unanalysiert → neutral. */
const DOT_BG: Record<ScoreBand, string> = {
  high: 'bg-brand',
  mid: 'bg-warning',
  low: 'bg-soon',
  very_low: 'bg-line-strong',
  none: 'bg-line-strong',
};

// Die Anker sind reine Zivildatum-Strings (YYYY-MM-DD); wie in CalendarNav
// werden Labels über UTC-Mitternacht + UTC-Formatter gebaut, damit kein
// TZ-Versatz entsteht (die Event-Platzierung selbst läuft über eventDayKey
// in Wien-Zeit).
const monthLabelFmt = new Intl.DateTimeFormat('de-AT', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const dayLabelFmt = new Intl.DateTimeFormat('de-AT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function ymdToUtcDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

interface DayCell {
  key: string;
  num: number;
  inMonth: boolean;
  dots: ScoreBand[];
}

/**
 * Kompakt-Monatskalender der Mobile-Events-Ansicht (M5, Mock Board-Mobile
 * Z. 487–536): 7-Spalten-Grid mit bis zu 3 Punkt-Markern pro Tag (Farbe =
 * Score-Band) + Liste des angetippten Tags darunter. Monat-Prev/Next sind
 * URL-getriebene Links (dieselbe `?date=`-Mechanik wie die Desktop-
 * Kalendernavigation); nur der ausgewählte Tag ist Client-State. Bewusst
 * handgerollt statt react-day-picker — das Mock-Grid (Mono-Ziffern,
 * Band-Punkte, Auswahl-Tint) wäre dort nur gegen die Library-Styles erreichbar.
 */
export function MobileMonthCalendar({
  events,
  window: win,
  prevHref,
  nextHref,
}: {
  events: Event[];
  window: CalendarWindow;
  prevHref: string;
  nextHref: string;
}) {
  // Default: heute, wenn sichtbar — sonst der Monatsanker. Der Parent keyed
  // die Komponente per Anchor, damit ein Monatswechsel die Auswahl resettet.
  const [selected, setSelected] = useState(
    win.containsToday ? win.todayAnchor : win.anchor,
  );

  const byDay = new Map<string, Event[]>();
  for (const event of events) {
    const key = eventDayKey(new Date(event.event_at));
    const list = byDay.get(key);
    if (list) list.push(event);
    else byDay.set(key, [event]);
  }

  const anchorMonth = win.anchor.slice(0, 7);
  const weeks: DayCell[][] = [];
  const cursor = ymdToUtcDate(win.gridStart);
  const end = ymdToUtcDate(win.gridEnd);
  while (cursor.getTime() <= end.getTime()) {
    const week: DayCell[] = [];
    for (let i = 0; i < 7; i++) {
      const key = cursor.toISOString().slice(0, 10);
      week.push({
        key,
        num: cursor.getUTCDate(),
        inMonth: key.slice(0, 7) === anchorMonth,
        dots: (byDay.get(key) ?? []).slice(0, 3).map(eventScoreBand),
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  }

  const selEvents = byDay.get(selected) ?? [];

  return (
    <div>
      {/* Monatsnavigation */}
      <div className="mb-3 flex items-center gap-2">
        <Link
          href={prevHref}
          replace
          scroll={false}
          prefetch={false}
          aria-label="Vorheriger Monat"
          className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-line-strong bg-surface text-ink-soft"
        >
          <ChevronLeft className="h-[15px] w-[15px]" />
        </Link>
        <span className="flex-1 text-center text-[15px] font-bold tracking-[-0.01em]">
          {monthLabelFmt.format(ymdToUtcDate(win.anchor))}
        </span>
        <Link
          href={nextHref}
          replace
          scroll={false}
          prefetch={false}
          aria-label="Nächster Monat"
          className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-line-strong bg-surface text-ink-soft"
        >
          <ChevronRight className="h-[15px] w-[15px]" />
        </Link>
      </div>

      {/* Monatsgrid */}
      <div className="overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_1px_2px_rgba(16,32,46,.05)]">
        <div className="grid grid-cols-7 border-b border-fill bg-surface-muted">
          {WEEKDAYS.map((wd) => (
            <div
              key={wd}
              className="py-[7px] text-center font-mono text-[9.5px] font-semibold uppercase tracking-[0.04em] text-ink-muted"
            >
              {wd}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((day, di) => {
              const isToday = day.key === win.todayAnchor;
              const isSel = day.key === selected;
              return (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => setSelected(day.key)}
                  aria-pressed={isSel}
                  className={cn(
                    'min-h-[44px] border-b border-fill pb-[3px] pt-[5px] text-center',
                    di < 6 && 'border-r',
                    isSel
                      ? 'bg-brand-50'
                      : day.inMonth
                        ? 'bg-surface'
                        : 'bg-surface-muted',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex h-[22px] w-[22px] items-center justify-center rounded-full font-mono text-[11.5px]',
                      isToday || isSel ? 'font-bold' : 'font-medium',
                      isToday
                        ? 'bg-brand text-white'
                        : isSel
                          ? 'text-brand'
                          : day.inMonth
                            ? 'text-ink-strong'
                            : 'text-ink-muted',
                    )}
                  >
                    {day.num}
                  </span>
                  <div className="mt-[3px] flex h-[5px] justify-center gap-[2px]">
                    {day.dots.map((band, i) => (
                      <span
                        key={i}
                        className={`block h-[5px] w-[5px] rounded-full ${DOT_BG[band]}`}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Liste des ausgewählten Tags */}
      <div className="mt-3.5">
        <div className="px-1 pb-[9px] pt-0.5 font-mono text-[11px] font-semibold text-ink-soft">
          {dayLabelFmt.format(ymdToUtcDate(selected))}
        </div>
        {selEvents.length === 0 ? (
          <div className="rounded-[12px] border-[1.5px] border-dashed border-line-strong px-3.5 py-[22px] text-center">
            <CalendarRange
              aria-hidden
              weight="duotone"
              className="mx-auto h-6 w-6 text-line-strong"
            />
            <div className="mt-[7px] text-[12.5px] text-ink-muted">
              Keine Veranstaltung an diesem Tag
            </div>
          </div>
        ) : (
          selEvents.map((event) => (
            <div
              key={event.id}
              className={`${AGENDA_CARD} ${AGENDA_BAR[eventScoreBand(event)]}`}
            >
              <AgendaCardHead event={event} />
              {event.decision !== 'undecided' && (
                <div className="mt-1.5">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-[9px] py-[3px] text-[11px] font-semibold',
                      event.decision === 'pitch'
                        ? 'bg-success-tint text-success'
                        : event.decision === 'hold'
                          ? 'bg-warning-tint text-warning-ink'
                          : 'bg-fill text-ink-muted',
                    )}
                  >
                    {event.decision === 'pitch'
                      ? 'Übernommen'
                      : event.decision === 'hold'
                        ? 'Warten'
                        : 'Verworfen'}
                  </span>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
