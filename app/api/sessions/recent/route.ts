import { NextRequest, NextResponse } from 'next/server';
import { apiError, getSupabaseFromRequest } from '@/lib/api-helpers';
import type { ReviewSession } from '@/lib/shared/types';

interface RecentSessionWithCounts {
  session: ReviewSession;
  counts: {
    pitch: number;
    hold: number;
    skip: number;
    total: number;
  };
}

/**
 * Returns the most recent finalized review session (attendees IS NOT NULL OR
 * facilitator IS NOT NULL OR notes IS NOT NULL → finished, not just a draft)
 * together with the decision-counts of pubs decided in that session.
 *
 * Used by /review for the onboarding-banner "letzte Sitzung"-recap.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseFromRequest(req);

    const { data: session, error: sErr } = await supabase
      .from('review_sessions')
      .select('*')
      .or('attendees.not.is.null,facilitator.not.is.null,notes.not.is.null')
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle<ReviewSession>();

    if (sErr) return apiError(sErr.message, 500);
    if (!session) return NextResponse.json({ recent: null });

    const { data: pubs, error: pErr } = await supabase
      .from('publications')
      .select('decision')
      .eq('decided_in_session', session.id);

    if (pErr) return apiError(pErr.message, 500);

    const counts = { pitch: 0, hold: 0, skip: 0, total: 0 };
    for (const r of (pubs as Array<{ decision: string | null }> | null) ?? []) {
      if (r.decision === 'pitch') counts.pitch++;
      else if (r.decision === 'hold') counts.hold++;
      else if (r.decision === 'skip') counts.skip++;
    }
    counts.total = counts.pitch + counts.hold + counts.skip;

    const result: RecentSessionWithCounts = { session, counts };
    return NextResponse.json({ recent: result });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
