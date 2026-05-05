import { NextRequest, NextResponse } from 'next/server';
import { apiError, getSupabaseAdmin } from '@/lib/api-helpers';
import type { ReviewSession } from '@/lib/types';

/**
 * Lazy-create a draft review_session. Called from /review on the first
 * decision-click of a meeting; the returned id is stashed in localStorage
 * (`currentSessionId`) and threaded into subsequent decisions via
 * `decided_in_session`.
 *
 * occurred_at is set to NOW() at creation (the migration enforces NOT NULL).
 * "Draft" is signaled by attendees/facilitator/notes still being NULL — the
 * /finish endpoint fills those in when the session wraps.
 */
export async function POST(_req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('review_sessions')
      .insert({ occurred_at: new Date().toISOString() })
      .select('*')
      .single<ReviewSession>();

    if (error || !data) {
      return apiError(error?.message ?? 'Failed to create session', 500);
    }
    return NextResponse.json({ session: data });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
