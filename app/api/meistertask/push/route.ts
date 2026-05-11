import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/server/http';
import { meistertaskPushPayloadSchema } from '@/lib/shared/schemas';
import { pushPublicationToMeistertask } from '@/lib/server/meistertask/push';
import type { MeistertaskPushResult } from '@/lib/shared/meistertask-types';

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError('Invalid request body', 400);
  }
  const parsed = meistertaskPushPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? 'Invalid payload', 400);
  }

  try {
    const result = await pushPublicationToMeistertask(
      parsed.data.publication_id,
      req.nextUrl.origin,
    );
    return resultToResponse(result);
  } catch (err) {
    // Without this catch the Lambda would return an empty 500 which the UI
    // surfaces as "Unexpected end of JSON input" — opaque to the user.
    console.error('[meistertask/push] uncaught exception', err);
    const detail = err instanceof Error ? err.message : 'unknown error';
    return apiError(`MeisterTask push crashed: ${detail}`, 500);
  }
}

function resultToResponse(result: MeistertaskPushResult): Response {
  switch (result.status) {
    case 'created':
    case 'already_pushed':
      return NextResponse.json(result);
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
}
