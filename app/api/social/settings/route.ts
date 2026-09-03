import { NextRequest, NextResponse } from 'next/server';
import { validateBody, withApiError } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth/require';
import { socialSettingsUpdateSchema } from '@/lib/shared/schemas';
import { getSocialSettings, updateSocialSettings } from '@/lib/server/social/settings';

export const GET = withApiError(async () => {
  return NextResponse.json(await getSocialSettings());
});

export const PATCH = withApiError(async (req: NextRequest) => {
  // Mutierend → angemeldete Identität Pflicht (Security-Audit M1);
  // requireUser wie bei /api/social/refresh (Settings-Karte ist member-facing).
  await requireUser();

  const patch = await validateBody(req, socialSettingsUpdateSchema);
  return NextResponse.json(await updateSocialSettings(patch));
});
