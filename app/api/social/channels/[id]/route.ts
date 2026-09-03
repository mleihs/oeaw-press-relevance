import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  validateBody,
  validateParams,
  withApiError,
} from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireUser } from '@/lib/server/auth/require';
import { socialChannelUpdateSchema } from '@/lib/shared/schemas';
import { updateChannel, deleteChannel } from '@/lib/server/social/channels';

export const PATCH = withApiError(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  // Mutierend → angemeldete Identität Pflicht (Security-Audit M1).
  await requireUser();

  const { id } = validateParams(await params, idParamSchema);
  const patch = await validateBody(req, socialChannelUpdateSchema);
  const channel = await updateChannel(id, patch);
  if (!channel) return apiError('Kanal nicht gefunden', 404);
  return NextResponse.json({ channel });
});

export const DELETE = withApiError(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  // Mutierend → angemeldete Identität Pflicht (Security-Audit M1).
  await requireUser();

  const { id } = validateParams(await params, idParamSchema);
  const ok = await deleteChannel(id);
  if (!ok) return apiError('Kanal nicht gefunden', 404);
  return NextResponse.json({ ok: true });
});
