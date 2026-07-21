import Link from 'next/link';
import { CalendarDays } from '@/lib/icons';
import { EventsSortHeader } from './events-sort-header';
import { ScoreReasonBadge } from './score-reason-badge';
import { EventRowActions } from './event-row-actions';
import { EventFlag } from './event-flag';
import { eventDayFmt, eventMonFmt, eventDateLongFmt } from '../_lib/event-format';
import { getScoreBand, type ScoreBand } from '@/lib/shared/score-utils';
import type { EventsFilterState } from '../_lib/build-events-url';
import type {
  EventsSort,
  EventsSortOrder,
  EventsTab,
} from '@/lib/shared/events-filter';
import type { Event } from '@/lib/shared/types';

interface Props {
  rows: Event[];
  /** eventId → Board-Karten-Deep-Link, nur für gepitchte Events (Comp Z. 292). */
  boardCardHrefs: Map<string, string>;
  /** Aktuelle Sortierung + der URL-Zustand, den die Sortierköpfe mitnehmen. */
  sort: EventsSort;
  order: EventsSortOrder;
  tab: EventsTab;
  main: boolean;
  filters: EventsFilterState;
}

// Kartengrund — identisch zu Dashboard/Publikationen (Design System §5).
const CARD =
  'rounded-[14px] border border-line bg-surface shadow-[0_1px_2px_rgba(16,32,46,.05)] overflow-hidden';

// Datum-Block-Farbe nach Score-Band (Comp: `e.dateStyle`). Tokens statt Hex.
const DATE_BLOCK: Record<ScoreBand, string> = {
  high: 'bg-brand-50 text-brand',
  mid: 'bg-warning-tint text-warning-ink',
  low: 'bg-soon-tint text-soon',
  very_low: 'bg-fill text-ink-subtle',
  none: 'bg-fill text-ink-muted',
};

/**
 * Veranstaltungs-Liste gemäß Toolkit-Redesign-Comp (Z. 269–304): Karten-Liste
 * statt HTML-Tabelle, konsistent mit /publications. Pro Zeile: farbiger
 * Datum-Block (nach Score-Band) · Titel + Meta-Chips · Score-Badge · inline
 * Relevant/Verwerfen. Der Flag-Pin (Notizen + voller Entscheidungs-Popover inkl.
 * „Warten") bleibt als sekundäre Affordanz erhalten.
 */
export function EventsTable({
  rows,
  boardCardHrefs,
  sort,
  order,
  tab,
  main,
  filters,
}: Props) {
  if (rows.length === 0) {
    return (
      <div className={CARD}>
        <div className="px-4 py-11 text-center">
          <CalendarDays aria-hidden className="mx-auto h-7 w-7 text-line-strong" />
          <div className="mt-2.5 text-sm text-ink-subtle">
            Keine Veranstaltungen in dieser Ansicht
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={CARD}>
      <EventsSortHeader sort={sort} order={order} tab={tab} main={main} filters={filters} />
      {rows.map((event) => (
        <EventRowView
          key={event.id}
          event={event}
          boardCardHref={boardCardHrefs.get(event.id)}
        />
      ))}
    </div>
  );
}

function EventRowView({
  event,
  boardCardHref,
}: {
  event: Event;
  boardCardHref?: string;
}) {
  const scored =
    event.analysis_status === 'analyzed' && event.event_score !== null;
  const band: ScoreBand = scored ? getScoreBand(event.event_score) : 'none';
  const start = new Date(event.event_at);
  const venue = event.location_title || event.organizer_title;

  return (
    <div className="flex items-center gap-4 border-b border-line px-[18px] py-3.5 last:border-b-0">
      {/* Datum-Block, farbig nach Score-Band */}
      <div
        className={`flex w-[52px] shrink-0 flex-col items-center rounded-[10px] py-2 ${DATE_BLOCK[band]}`}
        title={eventDateLongFmt.format(start)}
      >
        <div className="font-mono text-[17px] font-semibold leading-none">
          {eventDayFmt.format(start)}
        </div>
        <div className="mt-[3px] font-mono text-2xs font-medium uppercase leading-none tracking-[0.06em]">
          {eventMonFmt.format(start).replace('.', '')}
        </div>
      </div>

      {/* Titel + Meta */}
      <div className="min-w-0 flex-1">
        <Link
          href={`/events/${event.id}`}
          className="text-[14px] font-semibold leading-snug text-ink hover:text-brand hover:underline"
        >
          {event.title}
        </Link>
        {venue && (
          <div className="mt-[3px] truncate text-xs text-ink-subtle">
            {venue}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {event.institute && (
            <span className="rounded-full bg-fill px-2 py-[2px] text-2xs font-medium text-ink-soft">
              {event.institute}
            </span>
          )}
          {event.available_langs.map((lang) => (
            <span
              key={lang}
              className="rounded-full bg-fill px-2 py-[2px] text-2xs font-medium uppercase text-ink-muted"
            >
              {lang}
            </span>
          ))}
        </div>
      </div>

      {/* Score */}
      <div className="shrink-0">
        {scored ? (
          <ScoreReasonBadge score={event.event_score!} reasoning={event.reasoning} />
        ) : (
          <span
            className="font-mono text-2xs text-ink-muted"
            title="Noch nicht analysiert"
          >
            n/a
          </span>
        )}
      </div>

      {/* Aktionen */}
      <div className="flex w-[230px] shrink-0 items-center justify-end gap-2">
        <EventRowActions
          eventId={event.id}
          current={event.decision}
          boardCardHref={boardCardHref}
        />
        <EventFlag
          eventId={event.id}
          flagNotes={event.flag_notes}
          decision={event.decision}
        />
      </div>
    </div>
  );
}
