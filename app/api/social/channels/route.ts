import { NextRequest, NextResponse } from 'next/server';
import {
  errorToApiResponse,
  validateBody,
  withApiError,
} from '@/lib/server/http';
import { getEnv } from '@/lib/server/env';
import { listChannels } from '@/lib/server/social/list';
import { createChannel, SocialChannelConflictError } from '@/lib/server/social/channels';
import { socialChannelCreateSchema } from '@/lib/shared/schemas';

export const GET = withApiError(async () => {
  const channels = await listChannels();
  // The default look-back applied to channels with no per-channel override.
  return NextResponse.json({
    channels,
    default_lookback_days: getEnv().SOCIAL_WINDOW_DAYS,
  });
});

export const POST = withApiError(async (req: NextRequest) => {
  const body = await validateBody(req, socialChannelCreateSchema);
  try {
    const channel = await createChannel(body);
    return NextResponse.json({ channel }, { status: 201 });
  } catch (err) {
    if (err instanceof SocialChannelConflictError) {
      return errorToApiResponse(err, 409);
    }
    // parseInstagramHandle rejects non-handle input with a plain Error.
    if (err instanceof Error && /Ungültiger Instagram-Handle/.test(err.message)) {
      return errorToApiResponse(err, 400);
    }
    throw err;
  }
});
