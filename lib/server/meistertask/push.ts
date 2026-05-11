// Shared push-helper. Both the manual /api/meistertask/push route AND the
// auto-push triggered from /api/publications/[id]/decision (when a Pitch
// decision lands) call into this. Centralising avoids self-fetch overhead
// and keeps the dedup-write race-safe in one place.

import { and, eq, isNull } from 'drizzle-orm';
import { db, publications } from '@/lib/server/db';
import {
  getMeistertaskClient,
  MeistertaskAuthError,
  MeistertaskRateLimitError,
  MeistertaskApiError,
} from './client';
import { mapPublicationToTask, type TaskPublicationInput } from './mapping';
import { buildTaskUrl } from '@/lib/shared/meistertask-urls';
import type { MeistertaskPushResult } from '@/lib/shared/meistertask-types';

function parseLabelEnv(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

// Drizzle row -> mapPublicationToTask's input shape. Explicit (Plan §7.1):
// a column rename on the publications table fails to compile here, surfacing
// schema drift at build time instead of as a silent runtime miss in the task
// body or footer.
function toMappingInput(
  row: typeof publications.$inferSelect,
): TaskPublicationInput {
  return {
    id: row.id,
    title: row.title,
    original_title: row.originalTitle,
    citation: row.citation,
    press_score: row.pressScore,
    pitch_suggestion: row.pitchSuggestion,
    suggested_angle: row.suggestedAngle,
    target_audience: row.targetAudience,
    reasoning: row.reasoning,
    haiku: row.haiku,
    lead_author: row.leadAuthor,
    doi: row.doi,
  };
}

/**
 * Idempotent through the conditional write `meistertask_task_id IS NULL`:
 * concurrent calls don't double-write; the loser creates an orphan in MT
 * (recoverable via the `<!-- pub-id: <uuid> -->` marker in notes — same
 * dedup behaviour as the previous inline implementation).
 *
 * Returns a result-union; never throws on expected failure modes so callers
 * can map outcomes onto HTTP codes (manual route) or fail-soft (decision API).
 */
export async function pushPublicationToMeistertask(
  pubId: string,
  appBaseUrl: string,
): Promise<MeistertaskPushResult> {
  const token = process.env.MEISTERTASK_API_TOKEN;
  const sectionId = parseLabelEnv(process.env.MEISTERTASK_DEFAULT_SECTION_ID);
  if (!token || sectionId === undefined) {
    return { status: 'skipped', reason: 'not_configured' };
  }

  const [pub] = await db
    .select()
    .from(publications)
    .where(eq(publications.id, pubId))
    .limit(1);
  if (!pub) return { status: 'skipped', reason: 'pub_not_found' };

  if (pub.meistertaskTaskId) {
    return {
      status: 'already_pushed',
      task_id: pub.meistertaskTaskId,
      task_url: buildTaskUrl(pub.meistertaskTaskToken),
    };
  }

  const taskBody = mapPublicationToTask(toMappingInput(pub), {
    appBaseUrl,
    highLabelId: parseLabelEnv(process.env.MEISTERTASK_HIGH_LABEL_ID),
    midLabelId: parseLabelEnv(process.env.MEISTERTASK_MID_LABEL_ID),
  });

  const client = getMeistertaskClient(token);
  let task;
  try {
    task = await client.createTask(sectionId, taskBody);
  } catch (e) {
    if (e instanceof MeistertaskAuthError) {
      return { status: 'error', reason: 'auth' };
    }
    if (e instanceof MeistertaskRateLimitError) {
      return {
        status: 'error',
        reason: 'rate_limited',
        retry_after_seconds: e.retryAfterSeconds,
      };
    }
    if (e instanceof MeistertaskApiError) {
      return { status: 'error', reason: 'upstream' };
    }
    throw e;
  }

  // Conditional write: only fill the task_id columns when they are still
  // NULL. A concurrent push that beat this one wins; this call's task
  // lingers as orphan in MT (recoverable via the marker in notes). Mirrors
  // the prior Supabase-JS `.is('meistertask_task_id', null)` dedup.
  const updated = await db
    .update(publications)
    .set({
      meistertaskTaskId: String(task.id),
      meistertaskTaskToken: task.token,
    })
    .where(
      and(
        eq(publications.id, pubId),
        isNull(publications.meistertaskTaskId),
      ),
    )
    .returning({ id: publications.id });

  if (updated.length === 0) {
    console.warn('[meistertask] orphan task created (concurrent push)', {
      pubId,
      taskId: task.id,
    });
  }

  const url = buildTaskUrl(task.token);
  return {
    status: 'created',
    task_id: task.id,
    task_url: url ?? '',
  };
}
