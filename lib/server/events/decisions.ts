// Apply a triage decision to an event. Much narrower than
// lib/server/publications/decisions.ts: events have no MeisterTask push, no
// snooze, no rationale, no session linkage — just decision + (auto-managed)
// decided_at via trg_events_decided_at_sync.

import 'server-only';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, events as eventsTable } from '@/lib/server/db';
import { DECISIONS, type Decision } from '@/lib/shared/types';
import { EventNotFoundError } from './errors';

/** Server-side payload for PATCH /api/events/[id]/decision. */
export const eventDecisionPayloadSchema = z.object({
  decision: z.enum(DECISIONS),
});
export type EventDecisionPayload = z.infer<typeof eventDecisionPayloadSchema>;

export interface EventDecisionResult {
  id: string;
  decision: Decision;
  decided_at: string | null;
}

export async function applyEventDecision(
  eventId: string,
  payload: EventDecisionPayload,
): Promise<EventDecisionResult> {
  // Trigger trg_events_decided_at_sync writes decided_at inside the same
  // transaction, so .returning() sees the post-trigger row — no extra read.
  const [row] = await db
    .update(eventsTable)
    .set({ decision: payload.decision })
    .where(eq(eventsTable.id, eventId))
    .returning({
      id: eventsTable.id,
      decision: eventsTable.decision,
      decidedAt: eventsTable.decidedAt,
    });
  if (!row) throw new EventNotFoundError();
  return {
    id: row.id,
    decision: row.decision as Decision,
    decided_at: row.decidedAt ? new Date(row.decidedAt).toISOString() : null,
  };
}
