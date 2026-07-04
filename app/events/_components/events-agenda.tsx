import Link from 'next/link';
import { CalendarX } from '@/lib/icons';
import { ScoreReasonBadge } from './score-reason-badge';
import { EventAgendaActions } from './event-row-actions';
import {
  eventDayKey,
  eventDayMonthLongFmt,
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
            <AgendaCard
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

/** Titel/Venue/Score-Kopf einer Mobile-Event-Karte — von Agenda und
 *  Kalender-Tagesliste geteilt. */
export function AgendaCardHead({ event }: { event: Event }) {
  const scored =
    event.analysis_status === 'analyzed' && event.event_score !== null;
  const venue = event.location_title || event.organizer_title;

  return (
    <div className="flex items-start gap-2.5">
      <div className="min-w-0 flex-1">
        <Link
          href={`/events/${event.id}`}
          className="text-sm font-semibold leading-[1.3] text-ink"
        >
          {event.title}
        </Link>
        {venue && <div className="mt-1 text-xs text-ink-subtle">{venue}</div>}
      </div>
      <div className="shrink-0">
        {scored ? (
          <ScoreReasonBadge
            score={event.event_score!}
            reasoning={event.reasoning}
          />
        ) : (
          <span
            className="font-mono text-[11px] text-ink-muted"
            title="Noch nicht analysiert"
          >
            n/a
          </span>
        )}
      </div>
    </div>
  );
}

/** Score-Band eines Events (unanalysiert → 'none'); von Agenda-Balken und
 *  den Punkt-Markern des Kompakt-Kalenders geteilt. */
export function eventScoreBand(event: Event): ScoreBand {
  const scored =
    event.analysis_status === 'analyzed' && event.event_score !== null;
  return scored ? getScoreBand(event.event_score) : 'none';
}

function AgendaCard({
  event,
  boardCardHref,
}: {
  event: Event;
  boardCardHref?: string;
}) {
  return (
    <div className={`${AGENDA_CARD} ${AGENDA_BAR[eventScoreBand(event)]}`}>
      <AgendaCardHead event={event} />
      <EventAgendaActions
        eventId={event.id}
        current={event.decision}
        boardCardHref={boardCardHref}
      />
    </div>
  );
}
