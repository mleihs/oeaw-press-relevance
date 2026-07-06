// Generic maintainer flag-notes engine, shared by the events and publications
// flag routes. The dedup contract is identical across domains: notes are keyed
// by reviewer (`by`), so a re-flag from the same reviewer OVERWRITES their
// previous note + timestamp instead of stacking — the typical workflow is "I
// changed my mind about my note", not "I want two flags". Empty/missing `by`
// defaults to "team" until multi-user identity lands.
//
// Domains differ only in persistence: each injects a FlagNoteStore (read/write
// bound to one entity + the not-found error to throw). See lib/server/events/
// flag.ts and lib/server/publications/flag.ts for the ~10-line wrappers.

import 'server-only';
import type { FlagNote } from '@/lib/shared/types';
import type { FlagSetPayload, FlagDeletePayload } from '@/lib/shared/schemas';

/** Persistence + not-found behaviour for ONE target entity. The read/write
 *  closures already close over the entity id, so the engine stays id-agnostic. */
export interface FlagNoteStore {
  /** Current notes for the entity, or `undefined` if the entity doesn't exist
   *  (a real entity with no notes returns `[]`, not `undefined`). */
  readNotes: () => Promise<FlagNote[] | undefined>;
  /** Persist the new notes array for the entity. */
  writeNotes: (notes: FlagNote[]) => Promise<void>;
  /** Error thrown when `readNotes` reports the entity is missing. */
  notFound: () => Error;
}

// Normalized comparison so "Marie" and "marie " collapse to the same reviewer.
function norm(name: string): string {
  return name.trim().toLowerCase();
}

function defaultBy(by: string | null | undefined): string {
  return by?.trim() || 'team';
}

async function requireNotes(store: FlagNoteStore): Promise<FlagNote[]> {
  const notes = await store.readNotes();
  if (notes === undefined) throw store.notFound();
  return notes;
}

/** Upsert the current reviewer's flag note (overwrites their previous one). */
export async function setFlagNote(
  store: FlagNoteStore,
  payload: FlagSetPayload,
): Promise<FlagNote[]> {
  const by = defaultBy(payload.by);
  const note = payload.note?.trim() ?? '';
  const current = await requireNotes(store);
  const filtered = current.filter((n) => norm(n.by) !== norm(by));
  const next: FlagNote[] = [
    ...filtered,
    { by, note, at: new Date().toISOString() },
  ];
  await store.writeNotes(next);
  return next;
}

/** Remove the current reviewer's flag. No-op if they hadn't flagged. */
export async function clearFlagNote(
  store: FlagNoteStore,
  payload: FlagDeletePayload,
): Promise<FlagNote[]> {
  const by = defaultBy(payload.by);
  const current = await requireNotes(store);
  const next = current.filter((n) => norm(n.by) !== norm(by));
  await store.writeNotes(next);
  return next;
}
