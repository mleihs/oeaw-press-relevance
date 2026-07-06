import Link from 'next/link';
import {
  CalendarDays,
  Clock,
  MapPin,
  Building2,
  Building,
  ExternalLink,
  ArrowLeft,
  Info,
  Search,
} from '@/lib/icons';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DecisionBadge } from '@/components/decision-badge';
import { EventFlag } from '@/app/events/_components/event-flag';
import { CreateCardButton } from '@/components/board/create-card-button';
import { buildOeawSearchUrl } from '@/app/events/_lib/build-search-url';
import { eventToCardSource } from '@/app/events/_lib/event-to-card-source';
import {
  eventDateFmt,
  eventDateLongFmt,
  eventTimeFmt,
  formatEventEndTail,
  isSameLocalDay,
} from '@/app/events/_lib/event-format';
import { sanitizeEventInformation } from '@/lib/server/events/html-utils';
import { decodeHtmlBlock } from '@/lib/shared/html-utils';
import { EventAnalysisCard } from './event-analysis-card';
import type { Event } from '@/lib/shared/types';

export function EventDetail({ event }: { event: Event }) {
  const start = new Date(event.event_at);
  const end = event.event_end_at ? new Date(event.event_end_at) : null;
  const sanitizedInfo = event.event_information
    ? sanitizeEventInformation(event.event_information)
    : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
        <Link href="/events">
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Zur Liste
        </Link>
      </Button>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {event.institute && (
            <Badge variant="secondary" className="gap-1.5">
              <Building className="h-3 w-3" />
              {event.institute}
            </Badge>
          )}
          {event.available_langs.map((lang) => (
            <Badge key={lang} variant="outline" className="text-2xs uppercase">
              {lang}
            </Badge>
          ))}
          <DecisionBadge decision={event.decision} />
        </div>
        <h1 className="text-2xl font-bold leading-tight">{event.title}</h1>
        {event.teaser && (
          <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">
            {decodeHtmlBlock(event.teaser)}
          </p>
        )}
      </header>

      <Card>
        <CardContent className="p-5 grid gap-3 sm:grid-cols-[1fr_auto] items-start">
          <div className="space-y-2">
            <div className="flex items-start gap-2 text-sm">
              <CalendarDays className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">{eventDateLongFmt.format(start)}</div>
                <div className="text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <Clock className="h-3 w-3" />
                  {formatTimespan(start, end)}
                </div>
              </div>
            </div>
            {event.location_title && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <span>{event.location_title}</span>
              </div>
            )}
            {event.organizer_title && (
              <div className="flex items-start gap-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <span>{event.organizer_title}</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-self-end">
            <EventFlag
              eventId={event.id}
              flagNotes={event.flag_notes}
              decision={event.decision}
            />
            <CreateCardButton source={eventToCardSource(event)} />
            {event.url ? (
              <Button asChild size="sm" variant="outline">
                <a href={event.url} target="_blank" rel="noopener noreferrer">
                  Externe Seite
                  <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                </a>
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline" title="In der WEBDB ist keine URL hinterlegt. Google-Suche auf oeaw.ac.at.">
                <a
                  href={buildOeawSearchUrl(event.title)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Auf oeaw.ac.at suchen
                  <Search className="h-3.5 w-3.5 ml-1.5" />
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <EventAnalysisCard event={event} />

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        {event.bodytext && (
          <Card>
            <CardContent className="p-5">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">
                Beschreibung
              </h2>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {decodeHtmlBlock(event.bodytext)}
              </div>
            </CardContent>
          </Card>
        )}

        {sanitizedInfo && (
          <Card className={event.bodytext ? '' : 'md:col-span-2'}>
            <CardContent className="p-5 space-y-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" />
                Informationen
              </h2>
              <div
                className="prose prose-sm max-w-none text-sm leading-relaxed [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-3 [&_h3]:mb-1 [&_h4]:text-sm [&_h4]:font-medium [&_h4]:mt-3 [&_h4]:mb-1 [&_h5]:text-sm [&_h5]:font-medium [&_h5]:mt-3 [&_h5]:mb-1 [&_h6]:text-xs [&_h6]:font-medium [&_h6]:mt-3 [&_h6]:mb-1 [&_p]:my-1 [&_ul]:my-1 [&_a]:text-emerald-700 [&_a]:underline dark:[&_a]:text-emerald-400"
                dangerouslySetInnerHTML={{ __html: sanitizedInfo }}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {event.flag_notes.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Notizen ({event.flag_notes.length})
            </h2>
            <ul className="space-y-3">
              {event.flag_notes.map((n, i) => (
                <li key={`${n.by}-${i}`} className="border-l-2 border-amber-300 pl-3 py-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">{n.by}</span>
                    <span className="text-2xs text-muted-foreground/70">
                      {eventDateFmt.format(new Date(n.at))}
                    </span>
                  </div>
                  {n.note && (
                    <p className="text-sm text-foreground/85 mt-1 whitespace-pre-wrap">
                      {n.note}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="text-2xs text-muted-foreground/70 flex flex-wrap items-center gap-3">
        <span>WEBDB-UID: {event.webdb_uid}</span>
        <span>•</span>
        <span>Synchronisiert: {eventDateFmt.format(new Date(event.synced_at))}</span>
        {event.decided_at && (
          <>
            <span>•</span>
            <span>Entschieden: {eventDateFmt.format(new Date(event.decided_at))}</span>
          </>
        )}
      </div>
    </div>
  );
}

function formatTimespan(start: Date, end: Date | null): string {
  const startTime = eventTimeFmt.format(start);
  if (!end) return startTime;
  const tail = formatEventEndTail(start, end);
  if (isSameLocalDay(start, end)) {
    return `${startTime} – ${tail}`;
  }
  return `${startTime}, mehrtägig bis ${eventDateLongFmt.format(end)}`;
}
