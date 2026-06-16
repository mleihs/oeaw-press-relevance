import Link from 'next/link';
import { ExternalLink, MapPin, Building2, Building, ArrowRight, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DecisionBadge } from '@/components/decision-badge';
import { ScoreBadge } from '@/components/score-bar';
import { EventFlag } from './event-flag';
import { buildOeawSearchUrl } from '../_lib/build-search-url';
import { eventDateFmt, eventTimeFmt, isSameLocalDay } from '../_lib/event-format';
import { cn } from '@/lib/shared/utils';
import { decodeHtmlBlock } from '@/lib/shared/html-utils';
import type { Event } from '@/lib/server/events/to-api';

interface Props {
  rows: Event[];
}

/** Server-rendered table — same HTML-table convention as
 *  press-releases/_components/main-table.tsx. EventFlag (decision + notes)
 *  hydrates as a small client island per row. */
export function EventsTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center text-muted-foreground">
          Keine Veranstaltungen für dieses Filter.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Kommende Veranstaltungen</caption>
          <thead className="bg-muted/50">
            <tr>
              <th scope="col" className="p-3 text-left font-medium whitespace-nowrap">Datum</th>
              <th scope="col" className="p-3 text-left font-medium">Titel</th>
              <th scope="col" className="p-3 text-left font-medium">Ort / Veranstalter</th>
              <th scope="col" className="p-3 text-left font-medium whitespace-nowrap">Status</th>
              <th scope="col" className="p-3 text-center font-medium whitespace-nowrap">Relevanz</th>
              <th scope="col" className="p-3 text-right font-medium whitespace-nowrap">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((event) => (
              <EventRowView key={event.id} event={event} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function EventRowView({ event }: { event: Event }) {
  const decided = event.decision !== 'undecided';
  return (
    <tr
      className={cn(
        'border-t transition-colors hover:bg-muted/40',
        decided && 'bg-muted/20',
      )}
    >
      <td className="p-3 whitespace-nowrap text-xs text-muted-foreground align-top">
        <EventDate value={event.event_at} endValue={event.event_end_at} />
        {event.available_langs.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {event.available_langs.map((lang) => (
              <Badge key={lang} variant="outline" className="text-[10px] uppercase">
                {lang}
              </Badge>
            ))}
          </div>
        )}
      </td>
      <td className="p-3 max-w-md align-top">
        <Link
          href={`/events/${event.id}`}
          className="group inline-flex items-start gap-1.5 hover:text-brand"
        >
          <ArrowRight className="h-3.5 w-3.5 shrink-0 mt-1 text-muted-foreground group-hover:text-brand transition-transform group-hover:translate-x-0.5" />
          <span className="font-medium leading-snug line-clamp-2 group-hover:underline">
            {event.title}
          </span>
        </Link>
        {event.institute && (
          <div className="mt-1 ml-5">
            <Badge variant="secondary" className="gap-1 text-[10px] py-0">
              <Building className="h-2.5 w-2.5" />
              {event.institute}
            </Badge>
          </div>
        )}
        {event.teaser && (
          <p className="mt-1 ml-5 text-xs text-muted-foreground line-clamp-2 leading-snug whitespace-pre-wrap">
            {decodeHtmlBlock(event.teaser)}
          </p>
        )}
      </td>
      <td className="p-3 max-w-xs align-top">
        <div className="space-y-1 text-xs text-muted-foreground">
          {event.location_title && (
            <div className="flex items-start gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span className="line-clamp-2">{event.location_title}</span>
            </div>
          )}
          {event.organizer_title && (
            <div className="flex items-start gap-1.5">
              <Building2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span className="line-clamp-2">{event.organizer_title}</span>
            </div>
          )}
          {!event.location_title && !event.organizer_title && (
            <span className="italic text-muted-foreground/70">–</span>
          )}
        </div>
      </td>
      <td className="p-3 align-top">
        <DecisionBadge decision={event.decision} />
      </td>
      <td className="p-3 text-center align-top">
        {event.analysis_status === 'analyzed' && event.event_score !== null ? (
          <ScoreBadge score={event.event_score} ariaLabel="Relevanz-Score" />
        ) : (
          <span className="text-xs text-muted-foreground/50" title="Noch nicht analysiert">–</span>
        )}
      </td>
      <td className="p-3 text-right whitespace-nowrap align-top">
        <div className="inline-flex items-center gap-2">
          {event.url ? (
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              Seite <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <a
              href={buildOeawSearchUrl(event.title)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
              title="Auf oeaw.ac.at suchen (URL nicht direkt in WEBDB)"
            >
              Suche <Search className="h-3 w-3" />
            </a>
          )}
          <EventFlag
            eventId={event.id}
            flagNotes={event.flag_notes}
            decision={event.decision}
          />
        </div>
      </td>
    </tr>
  );
}

/** Renders the start datetime in de-AT and appends "– HH:MM" when the row
 *  has an event_end on the same day (most rows don't, but ÖAW workshops do). */
function EventDate({
  value,
  endValue,
}: {
  value: string;
  endValue: string | null;
}) {
  const start = new Date(value);
  const end = endValue ? new Date(endValue) : null;
  const startStr = eventDateFmt.format(start);
  if (!end || isSameLocalDay(start, end)) {
    const tail = end && eventTimeFmt.format(end);
    return (
      <span>
        {startStr}
        {tail && <span className="text-muted-foreground/70"> – {tail}</span>}
      </span>
    );
  }
  return (
    <span>
      {startStr}
      <span className="text-muted-foreground/70"> – {eventDateFmt.format(end)}</span>
    </span>
  );
}
