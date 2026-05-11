import { eq } from 'drizzle-orm';
import { db, publications } from '@/lib/server/db';
import type { FlagNote } from '@/lib/shared/types';
import type { FlagSetPayload, FlagDeletePayload } from '@/lib/shared/schemas';
import { PublicationNotFoundError } from './errors';

// Same-name dedup uses normalized comparison so "Marie" and "marie " match.
function norm(name: string): string {
  return name.trim().toLowerCase();
}

// Multi-user identity isn't wired yet — empty/missing `by` defaults to "team".
function defaultBy(by: string | null | undefined): string {
  return by?.trim() || 'team';
}

async function readNotes(pubId: string): Promise<FlagNote[]> {
  const [row] = await db
    .select({ flagNotes: publications.flagNotes })
    .from(publications)
    .where(eq(publications.id, pubId))
    .limit(1);
  if (!row) throw new PublicationNotFoundError();
  return (row.flagNotes as FlagNote[] | null) ?? [];
}

async function writeNotes(pubId: string, notes: FlagNote[]): Promise<void> {
  await db
    .update(publications)
    .set({ flagNotes: notes })
    .where(eq(publications.id, pubId));
}

/**
 * Upsert a flag note for the current reviewer. Same-name re-flag overwrites
 * the previous note + timestamp instead of stacking — the typical workflow
 * is "I changed my mind about my note", not "I want two flags".
 */
export async function setFlag(
  pubId: string,
  payload: FlagSetPayload,
): Promise<FlagNote[]> {
  const by = defaultBy(payload.by);
  const note = payload.note?.trim() ?? '';
  const current = await readNotes(pubId);
  const filtered = current.filter((n) => norm(n.by) !== norm(by));
  const next: FlagNote[] = [
    ...filtered,
    { by, note, at: new Date().toISOString() },
  ];
  await writeNotes(pubId, next);
  return next;
}

/** Remove the current reviewer's flag. No-op if they hadn't flagged. */
export async function clearFlag(
  pubId: string,
  payload: FlagDeletePayload,
): Promise<FlagNote[]> {
  const by = defaultBy(payload.by);
  const current = await readNotes(pubId);
  const next = current.filter((n) => norm(n.by) !== norm(by));
  await writeNotes(pubId, next);
  return next;
}
