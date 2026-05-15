import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  assertAllowedOrigin,
  withApiError,
} from '@/lib/server/http';
import { decisionPayloadSchema } from '@/lib/shared/schemas';
import { applyDecision } from '@/lib/server/publications/decisions';
import { PublicationNotFoundError } from '@/lib/server/publications/errors';

export const PATCH = withApiError(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;

  // Used downstream as the base URL embedded in MeisterTask task notes.
  // Reject anything outside the allow-list so a spoofed X-Forwarded-Host
  // cannot rewrite that link into a phishing target.
  const appBaseUrl = req.nextUrl.origin;
  const originBlock = assertAllowedOrigin(appBaseUrl);
  if (originBlock) return originBlock;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError('Invalid request body', 400);
  }

  const parsed = decisionPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? 'Invalid payload', 400);
  }

  try {
    const result = await applyDecision(parsed.data, id, {
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
