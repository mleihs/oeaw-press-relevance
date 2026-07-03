import 'server-only';

import { db, cardActivity } from '@/lib/server/db';
import type { ActivityVerb } from '@/lib/shared/board';

/**
 * Schreibt eine Zeile ins append-only Aktivitätslog. Wird nach der eigentlichen
 * Mutation aufgerufen (nie innerhalb eines withRankRetry — sonst doppelte
 * Einträge bei Retry). Der Trigger card_activity_append_only lässt Inserts zu
 * und verbietet nur UPDATE/DELETE.
 */
export async function writeActivity(
  cardId: string,
  actorId: string,
  verb: ActivityVerb,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(cardActivity).values({ cardId, actorId, verb, payload });
}
