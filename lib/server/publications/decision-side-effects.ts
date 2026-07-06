import 'server-only';
import { pushPublicationToMeistertask } from '@/lib/server/meistertask/push';
import type { MeistertaskPushResult } from '@/lib/shared/meistertask-types';
import type { DecisionPayload } from '@/lib/shared/schemas';

/**
 * Side-effect layer for publication triage decisions. Keeps outbound
 * integrations (MeisterTask today, more later) out of the decision core
 * (`decisions.ts`), which only persists the decision and then asks this module
 * to run whatever is registered. Register a new integration here — the core
 * never imports it directly.
 */

/** Context handed to every side effect after the decision write commits. */
export interface DecisionContext {
  pubId: string;
  decision: DecisionPayload['decision'];
  appBaseUrl: string;
}

/** Aggregated results, surfaced in the decision API response so the UI can
 *  report each outcome. One optional field per integration. */
export interface DecisionSideEffectResults {
  meistertask: MeistertaskPushResult | null;
}

/**
 * A side effect runs after the decision is persisted. Effects are fail-soft:
 * they must not throw for expected failure modes (the decision write already
 * committed) — return a status the caller can surface instead. Returning `{}`
 * means "not applicable for this decision".
 */
export interface DecisionSideEffect {
  onDecided(ctx: DecisionContext): Promise<Partial<DecisionSideEffectResults>>;
}

/**
 * One-way MeisterTask push. Only `pitch` decisions create a task; the push is
 * idempotent and fail-soft (see pushPublicationToMeistertask — MT errors don't
 * roll back the decision write, the caller surfaces `meistertask.status`).
 */
const meistertaskPush: DecisionSideEffect = {
  async onDecided(ctx) {
    if (ctx.decision !== 'pitch') return {};
    return {
      meistertask: await pushPublicationToMeistertask(ctx.pubId, ctx.appBaseUrl),
    };
  },
};

/** Registered effects, run in order after every decision write. */
const SIDE_EFFECTS: DecisionSideEffect[] = [meistertaskPush];

/** Runs the registered side effects and merges their results. Preserves the
 *  previous inline semantics (sequential, awaited, non-pitch → meistertask
 *  stays null). */
export async function runDecisionSideEffects(
  ctx: DecisionContext,
): Promise<DecisionSideEffectResults> {
  const results: DecisionSideEffectResults = { meistertask: null };
  for (const effect of SIDE_EFFECTS) {
    Object.assign(results, await effect.onDecided(ctx));
  }
  return results;
}
