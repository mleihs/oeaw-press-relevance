import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  assertAllowedOrigin,
  validateBody,
  validateParams,
  withApiError,
} from '@/lib/server/http';
import { decisionPayloadSchema } from '@/lib/shared/schemas';
import { idParamSchema } from '@/lib/server/schemas';
import { applyDecision } from '@/lib/server/publications/decisions';
import { PublicationNotFoundError } from '@/lib/server/publications/errors';

export const PATCH = withApiError(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = validateParams(await params, idParamSchema);

  // Used downstream as the base URL embedded in MeisterTask task notes.
  // Reject anything outside the allow-list so a spoofed X-Forwarded-Host
  // cannot rewrite that link into a phishing target.
  const appBaseUrl = req.nextUrl.origin;
  const originBlock = assertAllowedOrigin(appBaseUrl);
  if (originBlock) return originBlock;

  const data = await validateBody(req, decisionPayloadSchema);

  try {
    const result = await applyDecision(data, id, {
      appBaseUrl,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PublicationNotFoundError) {
      return apiError(err.message, 404);
    }
    throw err;
  }
});
