import { NextRequest, NextResponse } from 'next/server';
import {
  errorToApiResponse,
  validateBody,
  withApiError,
} from '@/lib/server/http';
import { listChannels } from '@/lib/server/social/list';
import { createChannel } from '@/lib/server/social/channels';
import {
  SocialChannelConflictError,
  InvalidInstagramHandleError,
} from '@/lib/server/social/errors';
import { socialChannelCreateSchema } from '@/lib/shared/schemas';
import { getSocialSettings } from '@/lib/server/social/settings';

export const GET = withApiError(async () => {
  const channels = await listChannels();
  // The default look-back applied to channels with no per-channel override.
  return NextResponse.json({
    channels,
    default_lookback_days: (await getSocialSettings()).fetch_window_days,
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
    if (err instanceof InvalidInstagramHandleError) {
      return errorToApiResponse(err, 400);
    }
    throw err;
  }
});
