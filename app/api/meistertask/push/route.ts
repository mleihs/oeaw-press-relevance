import { NextRequest, NextResponse } from 'next/server';
import { apiError, assertAllowedOrigin, withApiError } from '@/lib/server/http';
import { requestLogger } from '@/lib/server/log';
import { meistertaskPushPayloadSchema } from '@/lib/shared/schemas';
import { pushPublicationToMeistertask } from '@/lib/server/meistertask/push';
import type { MeistertaskPushResult } from '@/lib/shared/meistertask-types';

export const POST = withApiError(async (req: NextRequest) => {
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

  // The origin is embedded verbatim into the MeisterTask task ("open in tool"
  // link). A spoofed Host/Origin (which still passes assertSameOrigin) would
  // otherwise poison that external link, so gate it against the allow-list —
  // same guard the decision route already applies before embedding the origin.
  const originCheck = assertAllowedOrigin(req.nextUrl.origin);
  if (originCheck) return originCheck;

  try {
    const result = await pushPublicationToMeistertask(
      parsed.data.publication_id,
      req.nextUrl.origin,
    );
    return resultToResponse(result);
  } catch (err) {
    // Don't echo err.message back: upstream API errors can include tokens,
    // user IDs, or project metadata. Log server-side so operators can still
    // diagnose; response stays generic.
    requestLogger(req).error('meistertask_push_uncaught', { err });
    return apiError('MeisterTask push failed (see server logs)', 500);
  }
});

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
