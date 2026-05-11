import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReviewSession } from '@/lib/shared/types';
import type { SessionFinishPayload } from '@/lib/shared/schemas';

export class SessionNotFoundError extends Error {
  constructor(reason?: string) {
    super(reason ?? 'Session not found');
    this.name = 'SessionNotFoundError';
  }
}

export interface RecentSessionWithCounts {
  session: ReviewSession;
  counts: { pitch: number; hold: number; skip: number; total: number };
}

/**
 * Lazy-creates a draft review_session. Called on the first decision-click of
 * a meeting; the row stays "draft" until /finish fills attendees/facilitator/
 * notes. occurred_at is set to NOW() at creation (column is NOT NULL).
 */
export async function createSession(db: SupabaseClient): Promise<ReviewSession> {
  const { data, error } = await db
    .from('review_sessions')
    .insert({ occurred_at: new Date().toISOString() })
    .select('*')
    .single<ReviewSession>();
  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create session');
  }
  return data;
}

/**
 * Promotes a draft session to "finished" by filling the optional metadata
 * fields. Missing fields stay NULL. occurred_at is left untouched.
 */
export async function finishSession(
  sessionId: string,
  payload: SessionFinishPayload,
  db: SupabaseClient,
): Promise<ReviewSession> {
  const update: Record<string, unknown> = {};
  if (payload.attendees !== undefined && payload.attendees !== null) {
    const cleaned = payload.attendees
      .filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
      .map((a) => a.trim());
    update.attendees = cleaned.length > 0 ? cleaned : null;
  }
  if (payload.facilitator !== undefined && payload.facilitator !== null) {
    update.facilitator = payload.facilitator.trim() || null;
  }
  if (payload.notes !== undefined && payload.notes !== null) {
    update.notes = payload.notes.trim() || null;
  }

  const { data, error } = await db
    .from('review_sessions')
    .update(update)
    .eq('id', sessionId)
    .select('*')
    .single<ReviewSession>();
  if (error || !data) {
    throw new SessionNotFoundError(error?.message);
  }
  return data;
}

/**
 * Returns the most recent *finished* review session plus the decision-counts
 * of pubs decided in that session. "Finished" = at least one of attendees /
 * facilitator / notes is non-NULL. Used by /review for the onboarding-banner.
 */
export async function getRecentFinishedSession(
  db: SupabaseClient,
): Promise<RecentSessionWithCounts | null> {
  const { data: session, error: sErr } = await db
    .from('review_sessions')
    .select('*')
    .or('attendees.not.is.null,facilitator.not.is.null,notes.not.is.null')
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle<ReviewSession>();

  if (sErr) throw new Error(sErr.message);
  if (!session) return null;

  const { data: pubs, error: pErr } = await db
    .from('publications')
    .select('decision')
    .eq('decided_in_session', session.id);

  if (pErr) throw new Error(pErr.message);

  const counts = { pitch: 0, hold: 0, skip: 0, total: 0 };
  for (const r of (pubs as Array<{ decision: string | null }> | null) ?? []) {
    if (r.decision === 'pitch') counts.pitch++;
    else if (r.decision === 'hold') counts.hold++;
    else if (r.decision === 'skip') counts.skip++;
  }
  counts.total = counts.pitch + counts.hold + counts.skip;

  return { session, counts };
}
