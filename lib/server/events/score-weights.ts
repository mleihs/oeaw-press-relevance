// Event-score weighting: read the current/history configs and apply new ones.
// Weights are stored normalized (sum = 1) in an append-only history table
// (event_score_weights); the current weighting is the latest row. Applying new
// weights recomputes events.event_score over the *stored* sub-scores (no LLM
// re-run) so the column, the server sort, badges and calendar colours stay in
// lockstep, then appends a history row.

import { desc, eq, sql } from 'drizzle-orm';
import { db, events as eventsTable, eventScoreWeights } from '@/lib/server/db';
import { EVENT_SCORE_WEIGHTS } from '@/lib/shared/constants';
import type { EventScoreWeightEntry, EventScoreWeights } from '@/lib/shared/types';
import type { EventScoreWeightsUpdate } from '@/lib/shared/schemas';

type Row = typeof eventScoreWeights.$inferSelect;

function rowToEntry(row: Row): EventScoreWeightEntry {
  return {
    id: row.id,
    public_appeal: row.publicAppeal,
    scientific_significance: row.scientificSignificance,
    reach: row.reach,
    timeliness: row.timeliness,
    note: row.note,
    recomputed_count: row.recomputedCount,
    created_at: row.createdAt,
  };
}

/** Default seed used when the history table is somehow empty. */
function defaultEntry(): EventScoreWeightEntry {
  return {
    id: 0,
    ...EVENT_SCORE_WEIGHTS,
    note: 'Standard',
    recomputed_count: null,
    created_at: new Date(0).toISOString(),
  };
}

/** The current weighting (latest history row) as a bare map — for the score
 *  writers (analyze / apply-event-scores) so new analyses use it too. */
export async function getCurrentEventScoreWeights(): Promise<EventScoreWeights> {
  const [row] = await db
    .select()
    .from(eventScoreWeights)
    .orderBy(desc(eventScoreWeights.createdAt), desc(eventScoreWeights.id))
    .limit(1);
  if (!row) return { ...EVENT_SCORE_WEIGHTS };
  const e = rowToEntry(row);
  return {
    public_appeal: e.public_appeal,
    scientific_significance: e.scientific_significance,
    reach: e.reach,
    timeliness: e.timeliness,
  };
}

/** Current config + recent history (newest first) for the Settings UI. */
export async function getEventScoreWeightsState(): Promise<{
  current: EventScoreWeightEntry;
  history: EventScoreWeightEntry[];
}> {
  const rows = await db
    .select()
    .from(eventScoreWeights)
    .orderBy(desc(eventScoreWeights.createdAt), desc(eventScoreWeights.id))
    .limit(50);
  if (rows.length === 0) {
    const fallback = defaultEntry();
    return { current: fallback, history: [fallback] };
  }
  const history = rows.map(rowToEntry);
  return { current: history[0], history };
}

/** Normalize raw weights → sum 1, recompute all analyzed events' stored
 *  event_score, then append the new config to the history. */
export async function saveEventScoreWeights(
  patch: EventScoreWeightsUpdate,
): Promise<{ current: EventScoreWeightEntry; recomputed: number }> {
  const total =
    patch.public_appeal + patch.scientific_significance + patch.reach + patch.timeliness;
  const n = {
    public_appeal: patch.public_appeal / total,
    scientific_significance: patch.scientific_significance / total,
    reach: patch.reach / total,
    timeliness: patch.timeliness / total,
  };

  // Recompute every analyzed event's stored score from its stored sub-scores,
  // then append the history row — ATOMICALLY, so a crash between the two can't
  // leave events re-weighted with no record of which config produced them.
  // The recompute is a single set-based UPDATE (a bulk re-weight belongs in
  // Postgres, not N app round-trips). The weighted sum below MUST stay in
  // lockstep with weightedScore()/computeEventScore (lib/shared/scoring.ts):
  // NULL sub-scores count as 0, mirroring its `?? 0` — same JS+SQL dual-path
  // convention as the publication press_score.
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(eventsTable)
      .set({
        eventScore: sql`
          ${n.public_appeal} * COALESCE(${eventsTable.publicAppeal}, 0)
          + ${n.scientific_significance} * COALESCE(${eventsTable.scientificSignificance}, 0)
          + ${n.reach} * COALESCE(${eventsTable.reach}, 0)
          + ${n.timeliness} * COALESCE(${eventsTable.timeliness}, 0)`,
      })
      .where(eq(eventsTable.analysisStatus, 'analyzed'))
      .returning({ id: eventsTable.id });
    const recomputed = updated.length;

    const [row] = await tx
      .insert(eventScoreWeights)
      .values({
        publicAppeal: n.public_appeal,
        scientificSignificance: n.scientific_significance,
        reach: n.reach,
        timeliness: n.timeliness,
        note: patch.note?.trim() || null,
        recomputedCount: recomputed,
      })
      .returning();

    return { current: rowToEntry(row), recomputed };
  });
}
