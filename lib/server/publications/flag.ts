import type { SupabaseClient } from '@supabase/supabase-js';
import type { FlagNote } from '@/lib/shared/types';
import type { FlagSetPayload, FlagDeletePayload } from '@/lib/shared/schemas';

// Same-name dedup uses normalized comparison so "Marie" and "marie " match.
function norm(name: string): string {
  return name.trim().toLowerCase();
}

// Multi-user identity isn't wired yet — empty/missing `by` defaults to "team".
function defaultBy(by: string | null | undefined): string {
  return by?.trim() || 'team';
}

async function readNotes(db: SupabaseClient, pubId: string): Promise<FlagNote[]> {
  const { data, error } = await db
    .from('publications')
    .select('flag_notes')
    .eq('id', pubId)
    .single();
  if (error) throw new Error(error.message);
  return (data?.flag_notes as FlagNote[] | null) ?? [];
}

async function writeNotes(
  db: SupabaseClient,
  pubId: string,
  notes: FlagNote[],
): Promise<void> {
  const { error } = await db
    .from('publications')
    .update({ flag_notes: notes })
    .eq('id', pubId);
  if (error) throw new Error(error.message);
}

/**
 * Upsert a flag note for the current reviewer. Same-name re-flag overwrites
 * the previous note + timestamp instead of stacking — the typical workflow
 * is "I changed my mind about my note", not "I want two flags".
 */
export async function setFlag(
  pubId: string,
  payload: FlagSetPayload,
  db: SupabaseClient,
): Promise<FlagNote[]> {
  const by = defaultBy(payload.by);
  const note = payload.note?.trim() ?? '';
  const current = await readNotes(db, pubId);
  const filtered = current.filter((n) => norm(n.by) !== norm(by));
  const next: FlagNote[] = [
    ...filtered,
    { by, note, at: new Date().toISOString() },
  ];
  await writeNotes(db, pubId, next);
  return next;
}

/** Remove the current reviewer's flag. No-op if they hadn't flagged. */
export async function clearFlag(
  pubId: string,
  payload: FlagDeletePayload,
  db: SupabaseClient,
): Promise<FlagNote[]> {
  const by = defaultBy(payload.by);
  const current = await readNotes(db, pubId);
  const next = current.filter((n) => norm(n.by) !== norm(by));
  await writeNotes(db, pubId, next);
  return next;
}
