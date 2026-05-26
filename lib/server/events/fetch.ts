import { eq } from 'drizzle-orm';
import { db, events as eventsTable } from '@/lib/server/db';
import { eventRowToApi, type Event } from './to-api';

/** Single-row read for /events/[id]. Inlined Drizzle query: one consumer
 *  (the detail page), so no events-repo by the threshold rule in
 *  lib/server/repos/README.md. Returns undefined for a missing id; the
 *  page maps that to notFound(). The eventRowToApi mapper narrows the
 *  decision/flag_notes/lang columns so the page never casts. */
export async function getEventById(id: string): Promise<Event | undefined> {
  const [row] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, id))
    .limit(1);
  return row ? eventRowToApi(row) : undefined;
}
