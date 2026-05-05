import { NextRequest, NextResponse } from 'next/server';
import { apiError, getSupabaseAdmin } from '@/lib/api-helpers';
import type { FlagNote } from '@/lib/types';

// Same-name dedup uses normalized comparison so "Marie" and "marie " match.
function norm(name: string): string {
  return name.trim().toLowerCase();
}

function defaultBy(by: unknown): string {
  if (typeof by !== 'string') return 'team';
  const trimmed = by.trim();
  return trimmed || 'team';
}

async function readNotes(supabase: ReturnType<typeof getSupabaseAdmin>, id: string): Promise<FlagNote[]> {
  const { data, error } = await supabase
    .from('publications')
    .select('flag_notes')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return (data?.flag_notes as FlagNote[] | null) ?? [];
}

async function writeNotes(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  id: string,
  notes: FlagNote[],
): Promise<void> {
  const { error } = await supabase
    .from('publications')
    .update({ flag_notes: notes })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Upsert a flag for the current reviewer. Same-name re-flag overwrites the
 * previous note + timestamp instead of stacking — the typical workflow is
 * "I changed my mind about my note", not "I want two flags".
 *
 * Body: { by?: string, note?: string }
 *   by: empty/missing → "team" (multi-user identity not wired yet)
 *   note: empty allowed (just a flag without commentary)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    let body: { by?: unknown; note?: unknown };
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const by = defaultBy(body.by);
    const note = typeof body.note === 'string' ? body.note.trim() : '';

    const supabase = getSupabaseAdmin();
    const current = await readNotes(supabase, id);

    const filtered = current.filter((n) => norm(n.by) !== norm(by));
    const next: FlagNote[] = [...filtered, { by, note, at: new Date().toISOString() }];
    await writeNotes(supabase, id, next);

    return NextResponse.json({ flag_notes: next });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

/**
 * Remove the current reviewer's flag. Body: { by?: string }.
 * No-op if the reviewer hadn't flagged.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    let body: { by?: unknown };
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const by = defaultBy(body.by);
    const supabase = getSupabaseAdmin();
    const current = await readNotes(supabase, id);
    const next = current.filter((n) => norm(n.by) !== norm(by));
    await writeNotes(supabase, id, next);

    return NextResponse.json({ flag_notes: next });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
