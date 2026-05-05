import { NextRequest, NextResponse } from 'next/server';
import { apiError, getSupabaseAdmin } from '@/lib/api-helpers';
import { pushPublicationToMeistertask, type MeistertaskPushResult } from '@/lib/meistertask/push';
import type { Publication } from '@/lib/types';

const VALID_DECISIONS = ['undecided', 'pitch', 'hold', 'skip'] as const;
type Decision = (typeof VALID_DECISIONS)[number];

function defaultBy(by: unknown): string {
  if (typeof by !== 'string') return 'team';
  const trimmed = by.trim();
  return trimmed || 'team';
}

// snooze_until is a DATE column — accept only YYYY-MM-DD. Postgres would coerce
// other ISO formats but the column has no time component, so reject early to
// keep the contract obvious.
function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/**
 * Sets the triage decision for a publication. Body:
 *   { decision: 'undecided'|'pitch'|'hold'|'skip',
 *     decided_by?: string, decision_rationale?: string,
 *     snooze_until?: 'YYYY-MM-DD'|null,
 *     decided_in_session?: uuid|null }
 *
 * `decided_at` is auto-managed by trg_publications_decided_at_sync (see
 * migration 20260504000003) — we never set it from app code.
 *
 * Auto-push: when decision='pitch', triggers MeisterTask-push. The helper
 * is idempotent (already_pushed if a task exists), so we don't double-check
 * here. MT-failures are fail-soft: the decision still commits, the response
 * carries `meistertask: { status: 'error', ... }` so the UI can warn.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    let body: {
      decision?: unknown;
      decided_by?: unknown;
      decision_rationale?: unknown;
      snooze_until?: unknown;
      decided_in_session?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      return apiError('Invalid request body', 400);
    }

    if (
      typeof body.decision !== 'string' ||
      !VALID_DECISIONS.includes(body.decision as Decision)
    ) {
      return apiError('decision must be one of: undecided, pitch, hold, skip', 400);
    }
    const decision = body.decision as Decision;

    // Reverting to 'undecided' wipes the attribution fields too, so the row
    // returns to a clean default state (decided_at is cleared by the trigger).
    const decided_by = decision === 'undecided' ? null : defaultBy(body.decided_by);
    const rationale =
      decision === 'undecided'
        ? null
        : typeof body.decision_rationale === 'string' && body.decision_rationale.trim()
          ? body.decision_rationale.trim()
          : null;

    let snooze_until: string | null = null;
    if (body.snooze_until !== undefined && body.snooze_until !== null) {
      if (typeof body.snooze_until !== 'string' || !isIsoDate(body.snooze_until)) {
        return apiError('snooze_until must be YYYY-MM-DD', 400);
      }
      snooze_until = body.snooze_until;
    }

    const decided_in_session =
      decision === 'undecided'
        ? null
        : typeof body.decided_in_session === 'string' && body.decided_in_session
          ? body.decided_in_session
          : null;

    const supabase = getSupabaseAdmin();

    const { data: updated, error } = await supabase
      .from('publications')
      .update({
        decision,
        decided_by,
        decision_rationale: rationale,
        snooze_until,
        decided_in_session,
      })
      .eq('id', id)
      .select('*')
      .single<Publication>();

    if (error || !updated) {
      return apiError(error?.message ?? 'Publication not found', 404);
    }

    let meistertask: MeistertaskPushResult | null = null;
    if (decision === 'pitch') {
      meistertask = await pushPublicationToMeistertask(supabase, id, req.nextUrl.origin);
    }

    return NextResponse.json({
      publication: updated,
      meistertask,
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
