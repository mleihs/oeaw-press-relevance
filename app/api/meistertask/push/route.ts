import { NextRequest, NextResponse } from 'next/server';
import { apiError, getSupabaseAdmin } from '@/lib/api-helpers';
import {
  MeistertaskClient,
  MeistertaskAuthError,
  MeistertaskRateLimitError,
  MeistertaskApiError,
} from '@/lib/meistertask/client';
import { mapPublicationToTask } from '@/lib/meistertask/mapping';
import { PRESS_SCORE_PUSH_THRESHOLD } from '@/lib/meistertask/constants';
import type { Publication } from '@/lib/types';

// One-way push of a publication to MeisterTask. Idempotent via DB-side
// `meistertask_task_id` column — second call returns the existing task without
// hitting the upstream API.
//
// Race-condition safety: the DB UPDATE is conditional on `meistertask_task_id IS
// NULL`. If two concurrent requests both pass the early dedup check (because
// both saw NULL), only the first DB UPDATE wins; the second creates an orphan
// task in MeisterTask that the HTML-marker in `notes` makes recoverable later
// via reconciliation. We don't try to delete the orphan — that's another API
// call that can also fail, and orphans in DEV are harmless to clean up by hand.

export async function POST(req: NextRequest) {
  // 1. Parse + validate body
  let body: { publication_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiError('Invalid request body', 400);
  }
  const pubId = typeof body.publication_id === 'string' ? body.publication_id : '';
  if (!pubId) return apiError('publication_id required', 400);

  // 2. Env validation
  const token = process.env.MEISTERTASK_API_TOKEN;
  const sectionIdRaw = process.env.MEISTERTASK_DEFAULT_SECTION_ID;
  if (!token || !sectionIdRaw) {
    return apiError('MeisterTask not configured (env vars missing)', 500);
  }
  const sectionId = Number(sectionIdRaw);
  if (!Number.isFinite(sectionId)) {
    return apiError('MEISTERTASK_DEFAULT_SECTION_ID is not numeric', 500);
  }

  // 3. Fetch pub
  const supabase = getSupabaseAdmin();
  const { data: pub, error } = await supabase
    .from('publications')
    .select('*')
    .eq('id', pubId)
    .single<Publication>();
  if (error || !pub) return apiError('publication_not_found', 404);

  // 4. Idempotency: already pushed?
  if (pub.meistertask_task_id) {
    return NextResponse.json({
      status: 'already_pushed',
      task_id: pub.meistertask_task_id,
      task_url: buildTaskUrl(pub.meistertask_task_token),
    });
  }

  // 5. Threshold guard
  if (pub.press_score === null || pub.press_score < PRESS_SCORE_PUSH_THRESHOLD) {
    return apiError(
      `Score ${pub.press_score ?? 'null'} below push threshold ${PRESS_SCORE_PUSH_THRESHOLD}`,
      400,
    );
  }

  // 6. Build task body + push
  const highId = process.env.MEISTERTASK_HIGH_LABEL_ID;
  const midId = process.env.MEISTERTASK_MID_LABEL_ID;
  const taskBody = mapPublicationToTask(pub, {
    appBaseUrl: req.nextUrl.origin,
    highLabelId: highId ? Number(highId) : undefined,
    midLabelId: midId ? Number(midId) : undefined,
  });

  const client = new MeistertaskClient(token);
  let task;
  try {
    task = await client.createTask(sectionId, taskBody);
  } catch (e) {
    if (e instanceof MeistertaskAuthError) {
      return apiError('MeisterTask auth failed (admin: rotate MEISTERTASK_API_TOKEN)', 502);
    }
    if (e instanceof MeistertaskRateLimitError) {
      return NextResponse.json(
        { error: 'rate_limited', retry_after_seconds: e.retryAfterSeconds },
        { status: 429 },
      );
    }
    if (e instanceof MeistertaskApiError) {
      return apiError(`MeisterTask upstream error (${e.status})`, 502);
    }
    throw e;
  }

  // 7. Conditional DB update — race-safe via `IS NULL` predicate.
  // Persist both the numeric id (canonical API reference) and the URL token
  // (only format the MeisterTask web UI deep-links to).
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
    // Concurrent push won the race; this task is now an orphan in MeisterTask.
    // Recoverable via the HTML pub-id marker in notes — left to a reconciliation
    // script later. Don't try to DELETE the orphan: another fallible API call.
    console.warn('[meistertask] orphan task created (concurrent push)', {
      pubId,
      taskId: task.id,
    });
  }

  return NextResponse.json({
    status: 'created',
    task_id: task.id,
    task_url: buildTaskUrl(task.token),
  });
}

function buildTaskUrl(taskToken: string | null): string {
  // /app/task/{token} is the only deep-link form the MeisterTask web UI
  // actually opens. The numeric id form 404s. Token is missing only for
  // pre-token-migration rows that haven't been re-pushed; render no URL
  // in that case so callers can fall back to project-board navigation.
  if (!taskToken) return '';
  return `https://www.meistertask.com/app/task/${taskToken}`;
}
