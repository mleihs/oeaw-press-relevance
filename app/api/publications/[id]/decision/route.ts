import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/server/http';
import { decisionPayloadSchema } from '@/lib/shared/schemas';
import { applyDecision } from '@/lib/server/publications/decisions';
import { PublicationNotFoundError } from '@/lib/server/publications/errors';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

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
      appBaseUrl: req.nextUrl.origin,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PublicationNotFoundError) {
      return apiError(err.message, 404);
    }
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
