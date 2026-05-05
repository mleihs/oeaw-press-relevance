// Shared push-helper. Both the manual /api/meistertask/push route AND the
// auto-push triggered from /api/publications/[id]/decision (when a Pitch
// decision lands) call into this. Centralising avoids self-fetch overhead
// and keeps the dedup-write race-safe in one place.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getMeistertaskClient,
  MeistertaskAuthError,
  MeistertaskRateLimitError,
  MeistertaskApiError,
} from './client';
import { mapPublicationToTask } from './mapping';
import { buildTaskUrl } from './urls';
import type { Publication } from '@/lib/types';

export type MeistertaskPushResult =
  | { status: 'created'; task_id: number; task_url: string }
  | { status: 'already_pushed'; task_id: string; task_url: string | null }
  | { status: 'skipped'; reason: 'not_configured' | 'pub_not_found' }
  | {
      status: 'error';
      reason: 'auth' | 'rate_limited' | 'upstream';
      retry_after_seconds?: number;
    };

function parseLabelEnv(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
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
  supabase: SupabaseClient,
  pubId: string,
  appBaseUrl: string,
): Promise<MeistertaskPushResult> {
  const token = process.env.MEISTERTASK_API_TOKEN;
  const sectionId = parseLabelEnv(process.env.MEISTERTASK_DEFAULT_SECTION_ID);
  if (!token || sectionId === undefined) {
    return { status: 'skipped', reason: 'not_configured' };
  }

  const { data: pub, error } = await supabase
    .from('publications')
    .select('*')
    .eq('id', pubId)
    .single<Publication>();
  if (error || !pub) return { status: 'skipped', reason: 'pub_not_found' };

  if (pub.meistertask_task_id) {
    return {
      status: 'already_pushed',
      task_id: pub.meistertask_task_id,
      task_url: buildTaskUrl(pub.meistertask_task_token),
    };
  }

  const taskBody = mapPublicationToTask(pub, {
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

  const { data: updated } = await supabase
    .from('publications')
    .update({
      meistertask_task_id: String(task.id),
      meistertask_task_token: task.token,
    })
    .eq('id', pubId)
    .is('meistertask_task_id', null)
    .select('meistertask_task_id')
    .maybeSingle();

  if (!updated) {
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
