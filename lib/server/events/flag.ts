// Event flag-notes: thin binding of the generic flag-notes engine
// (lib/server/flag-notes.ts) to the events table. All dedup/timestamp logic
// lives in the engine; this only injects the inline Drizzle read/write (single
// call site — the flag route handler — so no events-repo is justified per
// repos/README.md) and the not-found error.

import { eq } from 'drizzle-orm';
import { db, events as eventsTable } from '@/lib/server/db';
import type { FlagNote } from '@/lib/shared/types';
import type { FlagSetPayload, FlagDeletePayload } from '@/lib/shared/schemas';
import { EventNotFoundError } from './errors';
import { setFlagNote, clearFlagNote, type FlagNoteStore } from '@/lib/server/flag-notes';

function store(eventId: string): FlagNoteStore {
  return {
    // No row → undefined (→ notFound). A row with null flag_notes → [].
    readNotes: async () => {
      const [row] = await db
        .select({ flagNotes: eventsTable.flagNotes })
        .from(eventsTable)
        .where(eq(eventsTable.id, eventId))
        .limit(1);
      return row ? ((row.flagNotes as FlagNote[] | null) ?? []) : undefined;
    },
    writeNotes: async (notes) => {
      await db
        .update(eventsTable)
        .set({ flagNotes: notes })
        .where(eq(eventsTable.id, eventId));
    },
    notFound: () => new EventNotFoundError(),
  };
}

export function setFlag(eventId: string, payload: FlagSetPayload): Promise<FlagNote[]> {
  return setFlagNote(store(eventId), payload);
}

export function clearFlag(eventId: string, payload: FlagDeletePayload): Promise<FlagNote[]> {
  return clearFlagNote(store(eventId), payload);
}
