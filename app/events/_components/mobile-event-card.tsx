'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarDays, X } from '@/lib/icons';
import { cn } from '@/lib/shared/utils';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
} from '@/components/ui/drawer';
import { ScoreReasonBadge } from './score-reason-badge';
import { EventAgendaActions } from './event-row-actions';
import {
  eventDayMonthLongFmt,
  eventTimeFmt,
  eventWeekdayShortFmt,
} from '../_lib/event-format';
import { getScoreBand, type ScoreBand } from '@/lib/shared/score-utils';
import type { Event } from '@/lib/shared/types';

/** Linker Akzentbalken nach Score-Band (Mock `evBand.bar`), tokenisiert wie
 *  der Datum-Block der Desktop-Tabelle: high=brand, mid=warning, low=soon. */
export const AGENDA_BAR: Record<ScoreBand, string> = {
  high: 'border-l-brand',
  mid: 'border-l-warning',
  low: 'border-l-soon',
  very_low: 'border-l-line-strong',
  none: 'border-l-line',
};

/** Kartengrund der Mobile-Event-Karten (M5) — wie die Pubs-Mobile-Karten (M4),
 *  plus 3px-Akzentbalken links. Auch vom Kompakt-Kalender-Tageslisting genutzt. */
export const AGENDA_CARD =
  'mb-2.5 rounded-[13px] border border-line border-l-[3px] bg-surface px-3.5 py-[13px] shadow-[0_1px_2px_rgba(16,32,46,.05)]';

/** Header-Tint des Detail-Sheets nach Score-Band (Mock `evBand.tint`). */
const SHEET_HEAD_TINT: Record<ScoreBand, string> = {
  high: 'bg-brand-50',
  mid: 'bg-warning-tint',
  low: 'bg-soon-tint',
  very_low: 'bg-fill',
  none: 'bg-fill',
};

/** Score-Band eines Events (unanalysiert → 'none'); von Agenda-Balken, den
 *  Punkt-Markern des Kompakt-Kalenders und dem Sheet-Header geteilt. */
export function eventScoreBand(event: Event): ScoreBand {
  const scored =
    event.analysis_status === 'analyzed' && event.event_score !== null;
  return scored ? getScoreBand(event.event_score) : 'none';
}

function EventScore({ event }: { event: Event }) {
  const scored =
    event.analysis_status === 'analyzed' && event.event_score !== null;
  return scored ? (
    <ScoreReasonBadge score={event.event_score!} reasoning={event.reasoning} />
  ) : (
    <span
      className="font-mono text-2xs text-ink-muted"
      title="Noch nicht analysiert"
    >
      n/a
    </span>
  );
}

/**
 * Mobile-Event-Karte (M5/M6b): Titel-Tap öffnet das Detail-Bottom-Sheet
 * (Mock Board-Mobile Z. 758–795) statt direkt auf die Detail-Page zu
 * navigieren; die Detail-Page bleibt über den Titel IM Sheet erreichbar.
 * `statusOnly` (Kompakt-Kalender-Tagesliste) zeigt statt der Aktionsreihe
 * nur den Entscheidungs-Pill — die Aktionen liegen dann im Sheet.
 */
export function MobileEventCard({
  event,
  boardCardHref,
  statusOnly = false,
}: {
  event: Event;
  boardCardHref?: string;
  statusOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const venue = event.location_title || event.organizer_title;

  return (
    <div className={`${AGENDA_CARD} ${AGENDA_BAR[eventScoreBand(event)]}`}>
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block text-sm font-semibold leading-[1.3] text-ink">
            {event.title}
          </span>
          {venue && (
            <span className="mt-1 block text-xs text-ink-subtle">{venue}</span>
          )}
        </button>
        <div className="shrink-0">
          <EventScore event={event} />
        </div>
      </div>

      {statusOnly ? (
        event.decision !== 'undecided' && (
          <div className="mt-1.5">
            <DecisionPill decision={event.decision} />
          </div>
        )
      ) : (
        <EventAgendaActions
          eventId={event.id}
          current={event.decision}
          boardCardHref={boardCardHref}
        />
      )}

      <EventDetailSheet
        event={event}
        boardCardHref={boardCardHref}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  );
}

function DecisionPill({ decision }: { decision: Event['decision'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-[9px] py-[3px] text-2xs font-semibold',
        decision === 'pitch'
          ? 'bg-success-tint text-success'
          : decision === 'hold'
            ? 'bg-warning-tint text-warning-ink'
            : 'bg-fill text-ink-muted',
      )}
    >
      {decision === 'pitch'
        ? 'Übernommen'
        : decision === 'hold'
          ? 'Warten'
          : 'Verworfen'}
    </span>
  );
}

/**
 * Event-Detail-Bottom-Sheet (M6b, Mock Z. 758–795): band-getinteter Header
 * mit Mono-Datum + X, Titel (→ Detail-Page) + Score, Venue, Institut/Sprach-
 * Chips und derselben Aktionsreihe wie die Agenda-Karte. Abweichung vom Mock
 * (vetobar): statt Kurz-Begründungs-Chips (keine strukturierten Reasons im
 * Backend) Institut/Sprache; die LLM-Begründung liegt im Score-Badge-Popover.
 */
function EventDetailSheet({
  event,
  boardCardHref,
  open,
  onOpenChange,
}: {
  event: Event;
  boardCardHref?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const start = new Date(event.event_at);
  const dateLabel = `${eventWeekdayShortFmt.format(start).replace('.', '')} · ${eventDayMonthLongFmt.format(start)} · ${eventTimeFmt.format(start)}`;
  const venue = event.location_title || event.organizer_title;
  const chips = [
    event.institute,
    ...event.available_langs.map((l) => l.toUpperCase()),
  ].filter(Boolean) as string[];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        aria-describedby={undefined}
        className="border-t-0"
        grabber={false}
      >
        <div
          className={cn(
            'flex shrink-0 items-center gap-2 rounded-t-[22px] px-4 py-3',
            SHEET_HEAD_TINT[eventScoreBand(event)],
          )}
        >
          <CalendarDays
            weight="fill"
            aria-hidden
            className="h-[17px] w-[17px] text-ink-soft"
          />
          <span className="font-mono text-xs font-medium text-ink-soft">
            {dateLabel}
          </span>
          <DrawerClose asChild>
            <button
              type="button"
              aria-label="Schließen"
              className="ml-auto flex h-8 w-8 items-center justify-center rounded-[9px] bg-white/60 text-ink-subtle"
            >
              <X className="h-[15px] w-[15px]" />
            </button>
          </DrawerClose>
        </div>

        <div className="overflow-y-auto px-[18px] pb-[26px] pt-4">
          <div className="flex items-start gap-2.5">
            <DrawerTitle className="flex-1 text-lg font-bold leading-[1.3] tracking-[-0.01em] text-ink">
              <Link href={`/events/${event.id}`}>{event.title}</Link>
            </DrawerTitle>
            <div className="shrink-0">
              <EventScore event={event} />
            </div>
          </div>
          {venue && (
            <div className="mt-1.5 text-sm text-ink-subtle">{venue}</div>
          )}
          {chips.length > 0 && (
            <div className="mt-[13px] flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full bg-fill px-[9px] py-[3px] text-2xs font-medium text-ink-soft"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
          <div className="mt-2">
            <EventAgendaActions
              eventId={event.id}
              current={event.decision}
              boardCardHref={boardCardHref}
            />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
