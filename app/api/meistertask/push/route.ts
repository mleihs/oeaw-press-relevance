import { NextRequest, NextResponse } from 'next/server';
import { apiError, getSupabaseAdmin } from '@/lib/api-helpers';
import {
  getMeistertaskClient,
  MeistertaskAuthError,
  MeistertaskRateLimitError,
  MeistertaskApiError,
} from '@/lib/meistertask/client';
import { mapPublicationToTask } from '@/lib/meistertask/mapping';
import { buildTaskUrl } from '@/lib/meistertask/urls';
import type { Publication } from '@/lib/types';

// Race-safety on the DB-write: the UPDATE is conditional on
// `meistertask_task_id IS NULL`. If two concurrent requests both pass the
// early dedup check, only the first commit wins; the second creates an
// orphan task in MeisterTask, recoverable via the HTML pub-id marker in
// notes. We don't try to delete the orphan — another fallible API call.

function parseLabelEnv(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function POST(req: NextRequest) {
  let body: { publication_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiError('Invalid request body', 400);
  }
  const pubId = typeof body.publication_id === 'string' ? body.publication_id : '';
  if (!pubId) return apiError('publication_id required', 400);

  const token = process.env.MEISTERTASK_API_TOKEN;
  const sectionId = parseLabelEnv(process.env.MEISTERTASK_DEFAULT_SECTION_ID);
  if (!token || sectionId === undefined) {
    return apiError('MeisterTask not configured (env vars missing or invalid)', 500);
  }

  const supabase = getSupabaseAdmin();
  const { data: pub, error } = await supabase
    .from('publications')
    .select('*')
    .eq('id', pubId)
    .single<Publication>();
  if (error || !pub) return apiError('publication_not_found', 404);

  if (pub.meistertask_task_id) {
    return NextResponse.json({
      status: 'already_pushed',
      task_id: pub.meistertask_task_id,
      task_url: buildTaskUrl(pub.meistertask_task_token),
    });
  }

  const taskBody = mapPublicationToTask(pub, {
    appBaseUrl: req.nextUrl.origin,
    highLabelId: parseLabelEnv(process.env.MEISTERTASK_HIGH_LABEL_ID),
    midLabelId: parseLabelEnv(process.env.MEISTERTASK_MID_LABEL_ID),
  });

  const client = getMeistertaskClient(token);
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

  return NextResponse.json({
    status: 'created',
    task_id: task.id,
    task_url: buildTaskUrl(task.token),
  });
}
