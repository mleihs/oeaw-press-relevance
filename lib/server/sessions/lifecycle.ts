import { desc, eq, isNotNull, or } from 'drizzle-orm';
import { db, publications, reviewSessions } from '@/lib/server/db';
import type { ReviewSession } from '@/lib/shared/types';
import type { SessionFinishPayload } from '@/lib/shared/schemas';

const FRESHNESS_FALLBACK_DAYS = 7;

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

// Drizzle returns camelCase TS keys; the API contract is snake_case
// (matches the original Supabase-JS PostgREST shape consumers expect).
// Timestamps are normalized to ISO-8601 because drizzle-orm's postgres-js
// driver returns Postgres-native strings ("2026-05-11 12:46:16.839+00")
// with `mode: 'string'`, but the JSON contract has always been ISO-8601
// ("2026-05-11T12:46:16.839Z") — that's what `new Date(...)` parses
// reliably across browsers.
function toApi(row: typeof reviewSessions.$inferSelect): ReviewSession {
  return {
    id: row.id,
    occurred_at: new Date(row.occurredAt).toISOString(),
    attendees: row.attendees,
    facilitator: row.facilitator,
    notes: row.notes,
    created_at: new Date(row.createdAt).toISOString(),
  };
}

/**
 * Latest review-session occurred_at, normalised to ISO-8601. Falls back to
 * "7 days ago" when no session exists — the freshness window the queue uses
 * for "new since last meeting" pubs. Lives here (not in review/queue.ts)
 * because it's a sessions-domain read; queue is one of two consumers.
 */
export async function getLatestSessionTimestamp(): Promise<string> {
  const [row] = await db
    .select({ occurredAt: reviewSessions.occurredAt })
    .from(reviewSessions)
    .orderBy(desc(reviewSessions.occurredAt))
    .limit(1);
  if (row?.occurredAt) return new Date(row.occurredAt).toISOString();
  const fallback = new Date();
  fallback.setDate(fallback.getDate() - FRESHNESS_FALLBACK_DAYS);
  return fallback.toISOString();
}

/**
 * Lazy-creates a draft review_session. Called on the first decision-click of
 * a meeting; the row stays "draft" until /finish fills attendees/facilitator/
 * notes. occurred_at is set to NOW() at creation (column is NOT NULL).
 */
export async function createSession(): Promise<ReviewSession> {
  const [row] = await db
    .insert(reviewSessions)
    .values({ occurredAt: new Date().toISOString() })
    .returning();
  if (!row) throw new Error('Failed to create session');
  return toApi(row);
}

/**
 * Promotes a draft session to "finished" by filling the optional metadata
 * fields. Missing fields stay NULL. occurred_at is left untouched. If the
 * caller supplies no actionable fields, returns the current row unchanged
 * (Drizzle rejects an empty SET clause, the original Supabase-JS happened
 * to be lenient — preserving that contract here explicitly).
 */
export async function finishSession(
  sessionId: string,
  payload: SessionFinishPayload,
): Promise<ReviewSession> {
  const update: Partial<typeof reviewSessions.$inferInsert> = {};
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

  if (Object.keys(update).length === 0) {
    const [row] = await db
      .select()
      .from(reviewSessions)
      .where(eq(reviewSessions.id, sessionId))
      .limit(1);
    if (!row) throw new SessionNotFoundError();
    return toApi(row);
  }

  const [row] = await db
    .update(reviewSessions)
    .set(update)
    .where(eq(reviewSessions.id, sessionId))
    .returning();
  if (!row) throw new SessionNotFoundError();
  return toApi(row);
}

/**
 * Returns the most recent *finished* review session plus the decision-counts
 * of pubs decided in that session. "Finished" = at least one of attendees /
 * facilitator / notes is non-NULL. Used by /review for the onboarding-banner.
 */
export async function getRecentFinishedSession(): Promise<RecentSessionWithCounts | null> {
  const [session] = await db
    .select()
    .from(reviewSessions)
    .where(
      or(
        isNotNull(reviewSessions.attendees),
        isNotNull(reviewSessions.facilitator),
        isNotNull(reviewSessions.notes),
      ),
    )
    .orderBy(desc(reviewSessions.occurredAt))
    .limit(1);

  if (!session) return null;

  const decisions = await db
    .select({ decision: publications.decision })
    .from(publications)
    .where(eq(publications.decidedInSession, session.id));

  const counts = { pitch: 0, hold: 0, skip: 0, total: 0 };
  for (const r of decisions) {
    if (r.decision === 'pitch') counts.pitch++;
    else if (r.decision === 'hold') counts.hold++;
    else if (r.decision === 'skip') counts.skip++;
  }
  counts.total = counts.pitch + counts.hold + counts.skip;

  return { session: toApi(session), counts };
}
