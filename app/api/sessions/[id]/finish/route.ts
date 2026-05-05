import { NextRequest, NextResponse } from 'next/server';
import { apiError, getSupabaseAdmin } from '@/lib/api-helpers';
import type { ReviewSession } from '@/lib/types';

/**
 * Finalize a draft review_session. Body:
 *   { attendees?: string[], facilitator?: string, notes?: string }
 *
 * Each field is optional; missing fields stay NULL on the row. occurred_at
 * is left untouched (it was set at session-create time).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    let body: { attendees?: unknown; facilitator?: unknown; notes?: unknown };
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const update: Record<string, unknown> = {};
    if (Array.isArray(body.attendees)) {
      const cleaned = body.attendees
        .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
        .map((a) => a.trim());
      update.attendees = cleaned.length > 0 ? cleaned : null;
    }
    if (typeof body.facilitator === 'string') {
      const trimmed = body.facilitator.trim();
      update.facilitator = trimmed || null;
    }
    if (typeof body.notes === 'string') {
      const trimmed = body.notes.trim();
      update.notes = trimmed || null;
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('review_sessions')
      .update(update)
      .eq('id', id)
      .select('*')
      .single<ReviewSession>();

    if (error || !data) {
      return apiError(error?.message ?? 'Session not found', 404);
    }
    return NextResponse.json({ session: data });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
