import { NextRequest, NextResponse } from 'next/server';
import { apiError, getSupabaseAdmin } from '@/lib/api-helpers';
import { pushPublicationToMeistertask } from '@/lib/meistertask/push';

export async function POST(req: NextRequest) {
  try {
    let body: { publication_id?: unknown };
    try {
      body = await req.json();
    } catch {
      return apiError('Invalid request body', 400);
    }
    const pubId = typeof body.publication_id === 'string' ? body.publication_id : '';
    if (!pubId) return apiError('publication_id required', 400);

    const supabase = getSupabaseAdmin();
    const result = await pushPublicationToMeistertask(supabase, pubId, req.nextUrl.origin);

    switch (result.status) {
      case 'created':
        return NextResponse.json({
          status: 'created',
          task_id: result.task_id,
          task_url: result.task_url,
        });
      case 'already_pushed':
        return NextResponse.json({
          status: 'already_pushed',
          task_id: result.task_id,
          task_url: result.task_url,
        });
      case 'skipped':
        if (result.reason === 'pub_not_found') return apiError('publication_not_found', 404);
        return apiError('MeisterTask not configured (env vars missing or invalid)', 500);
      case 'error':
        if (result.reason === 'auth') {
          return apiError('MeisterTask auth failed (admin: rotate MEISTERTASK_API_TOKEN)', 502);
        }
        if (result.reason === 'rate_limited') {
          return NextResponse.json(
            { error: 'rate_limited', retry_after_seconds: result.retry_after_seconds },
            { status: 429 },
          );
        }
        return apiError('MeisterTask upstream error', 502);
    }
  } catch (err) {
    // Unexpected exception path — e.g. network/JSON-parse error inside the
    // MeisterTask HTTP client, or an uncaught error in mapping/Supabase.
    // Without this catch the Lambda crashes and Vercel returns a 500 with an
    // empty body, which the client UI surfaces as "Failed to execute 'json'
    // on 'Response': Unexpected end of JSON input" — opaque to the user.
    console.error('[meistertask/push] uncaught exception', err);
    const detail = err instanceof Error ? err.message : 'unknown error';
    return apiError(`MeisterTask push crashed: ${detail}`, 500);
  }
}
