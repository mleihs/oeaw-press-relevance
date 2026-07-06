import 'server-only';
import { publicationsRepo } from '@/lib/server/repos/publications';
import type { Publication } from '@/lib/shared/types';
import type { DecisionPayload } from '@/lib/shared/schemas';
import {
  runDecisionSideEffects,
  type DecisionSideEffectResults,
} from './decision-side-effects';
import { PublicationNotFoundError } from './errors';
import { publicationToApi } from './to-api';

export interface DecisionResult {
  publication: Publication;
  meistertask: DecisionSideEffectResults['meistertask'];
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
 *   never set from app code. Drizzle's `.returning()` sees post-trigger
 *   state (same transaction).
 * - post-write side effects (e.g. the one-way MeisterTask push on `pitch`)
 *   run via runDecisionSideEffects — registered in decision-side-effects.ts,
 *   never wired into this core. They are fail-soft: an integration error
 *   doesn't roll back the decision write, the caller surfaces the returned
 *   status to the UI.
 */
export async function applyDecision(
  payload: DecisionPayload,
  pubId: string,
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

  const updated = await publicationsRepo.updateDecision(pubId, {
    decision: payload.decision,
    decidedBy: decided_by,
    decisionRationale: decision_rationale,
    snoozeUntil: snooze_until,
    decidedInSession: decided_in_session,
  });

  if (!updated) {
    throw new PublicationNotFoundError();
  }

  const sideEffects = await runDecisionSideEffects({
    pubId,
    decision: payload.decision,
    appBaseUrl: opts.appBaseUrl,
  });

  return {
    publication: publicationToApi(updated),
    meistertask: sideEffects.meistertask,
  };
}
