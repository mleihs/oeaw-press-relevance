// Maintainer flag-notes for events. Mirrors lib/server/publications/flag.ts:
// same-name dedup (a re-flag overwrites the previous note + timestamp instead
// of stacking — typical workflow is "I changed my mind about my note"), empty
// `by` defaults to 'team' until multi-user identity lands.
//
// Inlined Drizzle reads/writes — single call site (the flag route handler),
// so no events-repo is justified per repos/README.md.

import { eq } from 'drizzle-orm';
import { db, events as eventsTable } from '@/lib/server/db';
import type { FlagNote } from '@/lib/shared/types';
import type { FlagSetPayload, FlagDeletePayload } from '@/lib/shared/schemas';
import { EventNotFoundError } from './errors';

function norm(name: string): string {
  return name.trim().toLowerCase();
}

function defaultBy(by: string | null | undefined): string {
  return by?.trim() || 'team';
}

async function readNotes(eventId: string): Promise<FlagNote[]> {
  const [row] = await db
    .select({ flagNotes: eventsTable.flagNotes })
    .from(eventsTable)
    .where(eq(eventsTable.id, eventId))
    .limit(1);
  if (!row) throw new EventNotFoundError();
  return (row.flagNotes as FlagNote[] | null) ?? [];
}

async function writeNotes(eventId: string, notes: FlagNote[]): Promise<void> {
  await db
    .update(eventsTable)
    .set({ flagNotes: notes })
    .where(eq(eventsTable.id, eventId));
}

export async function setFlag(
  eventId: string,
  payload: FlagSetPayload,
): Promise<FlagNote[]> {
  const by = defaultBy(payload.by);
  const note = payload.note?.trim() ?? '';
  const current = await readNotes(eventId);
  const filtered = current.filter((n) => norm(n.by) !== norm(by));
  const next: FlagNote[] = [
    ...filtered,
    { by, note, at: new Date().toISOString() },
  ];
  await writeNotes(eventId, next);
  return next;
}

export async function clearFlag(
  eventId: string,
  payload: FlagDeletePayload,
): Promise<FlagNote[]> {
  const by = defaultBy(payload.by);
  const current = await readNotes(eventId);
  const next = current.filter((n) => norm(n.by) !== norm(by));
  await writeNotes(eventId, next);
  return next;
}
