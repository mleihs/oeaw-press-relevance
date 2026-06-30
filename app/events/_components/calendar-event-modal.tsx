'use client';

// Triage cockpit opened from a calendar event click (the island wires
// Schedule-X's onEventClick → this controlled shadcn Dialog, so we get Radix
// focus-trap / escape / a11y instead of the library's built-in modal). Reuses
// the detail page's EventAnalysisCard (score hero + 4 dimensions + pitch) and
// EventDecisionButtons (Pitch/Hold/Skip) verbatim, so the calendar is a real
// workspace and stays visually identical to the rest of the events feature.
import Link from 'next/link';
import { ExternalLink, MapPin, Building2, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { EventAnalysisCard } from '@/app/events/[id]/_components/event-analysis-card';
import { EventDecisionButtons } from './event-decision-buttons';
import { eventDateLongFmt, eventTimeFmt } from '../_lib/event-format';
import type { Event } from '@/lib/shared/types';

interface Props {
  event: Event | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CalendarEventModal({ event, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[88vh] gap-4 overflow-y-auto sm:max-w-xl"
        // Don't auto-focus the first interactive child: for analyzed events that
        // is the score's InfoBubble, whose onFocus opens the popover — so it
        // would spring open over the modal content the moment the dialog opens.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {event && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6 leading-snug">{event.title}</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-1 text-sm">
                  <div>
                    {eventDateLongFmt.format(new Date(event.event_at))}
                    {', '}
                    {eventTimeFmt.format(new Date(event.event_at))}
                    {event.event_end_at && (
                      <> – {eventTimeFmt.format(new Date(event.event_end_at))}</>
                    )}
                  </div>
                  {event.location_title && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span>{event.location_title}</span>
                    </div>
                  )}
                  {event.organizer_title && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                      <span>{event.organizer_title}</span>
                    </div>
                  )}
                </div>
              </DialogDescription>
            </DialogHeader>

            {event.available_langs.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {event.available_langs.map((lang) => (
                  <Badge key={lang} variant="outline" className="text-[10px] uppercase">
                    {lang}
                  </Badge>
                ))}
              </div>
            )}

            {/* Score hero + 4 dimensions + pitch (renders null until analyzed). */}
            <EventAnalysisCard event={event} />
            {(event.analysis_status !== 'analyzed' || event.event_score === null) && (
              <p className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                Noch nicht analysiert – keine Relevanz-Bewertung vorhanden.
              </p>
            )}

            <EventDecisionButtons eventId={event.id} current={event.decision} />

            <div className="flex items-center justify-between border-t pt-3 text-sm">
              <Link
                href={`/events/${event.id}`}
                className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
              >
                Details öffnen <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              {event.url && (
                <a
                  href={event.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  Event-Seite <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
