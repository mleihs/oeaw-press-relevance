'use client';

import type { FlagNote, Decision } from '@/lib/shared/types';
import { QK } from '@/lib/client/query-keys';
import { EntityFlag } from '@/components/entity-flag';
import { EventDecisionButtons } from './event-decision-buttons';

interface EventFlagProps {
  eventId: string;
  flagNotes: FlagNote[];
  decision: Decision;
  size?: 'sm' | 'md';
}

/** Thin wrapper around <EntityFlag>, with EventDecisionButtons docked into
 *  the popover footer so the maintainer can flag + decide from a single
 *  affordance per row (the page is tighter than /publications, which uses
 *  separate flag/decision surfaces). */
export function EventFlag({
  eventId,
  flagNotes,
  decision,
  size,
}: EventFlagProps) {
  return (
    <EntityFlag
      entityId={eventId}
      flagNotes={flagNotes}
      apiBase={`/api/events/${eventId}`}
      invalidateOnSuccess={[QK.events, QK.event(eventId)]}
      decision={decision}
      size={size}
      extraPopoverContent={
        <EventDecisionButtons eventId={eventId} current={decision} />
      }
      infoBubbleId="event_flag"
    />
  );
}
