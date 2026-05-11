import type { SupabaseClient } from '@supabase/supabase-js';
import type { Publication } from '@/lib/shared/types';
import type { DecisionPayload } from '@/lib/shared/schemas';
import { pushPublicationToMeistertask } from '@/lib/server/meistertask/push';
import type { MeistertaskPushResult } from '@/lib/shared/meistertask-types';
import { PublicationNotFoundError } from './errors';

export interface DecisionResult {
  publication: Publication;
  meistertask: MeistertaskPushResult | null;
}

/**
 * Applies a triage decision to a publication. Semantic rules:
 *
 * - `undecided` is a reset: attribution fields (decided_by, rationale,
 *   decided_in_session) are cleared so the row returns to default state.
 *   snooze_until is intentionally preserved on reset (matches existing
 *   route behaviour — a user may want to keep the snooze while
 *   un-deciding).
 * - `decided_at` is auto-managed by trg_publications_decided_at_sync;
 *   never set from app code.
 * - `pitch` triggers a one-way MeisterTask push. The push is idempotent
 *   and fail-soft: MT errors don't roll back the decision write, the
 *   caller surfaces `meistertask.status` to the UI.
 */
export async function applyDecision(
  payload: DecisionPayload,
  pubId: string,
  db: SupabaseClient,
  opts: { appBaseUrl: string },
): Promise<DecisionResult> {
  const isReset = payload.decision === 'undecided';
  const decided_by = isReset ? null : payload.decided_by?.trim() || 'team';
  const decision_rationale = isReset
    ? null
    : payload.decision_rationale?.trim() || null;
  const decided_in_session = isReset
    ? null
    : payload.decided_in_session || null;
  const snooze_until = payload.snooze_until ?? null;

  const { data: updated, error } = await db
    .from('publications')
    .update({
      decision: payload.decision,
      decided_by,
      decision_rationale,
      snooze_until,
      decided_in_session,
    })
    .eq('id', pubId)
    .select('*')
    .single<Publication>();

  if (error || !updated) {
    throw new PublicationNotFoundError(error?.message);
  }

  const meistertask =
    payload.decision === 'pitch'
      ? await pushPublicationToMeistertask(pubId, opts.appBaseUrl)
      : null;

  return { publication: updated, meistertask };
}
