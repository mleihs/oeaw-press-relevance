import { NextRequest, NextResponse } from 'next/server';
import { apiError, withApiError } from '@/lib/server/http';
import {
  flagSetPayloadSchema,
  flagDeletePayloadSchema,
} from '@/lib/shared/schemas';
import { setFlag, clearFlag } from '@/lib/server/publications/flag';
import { PublicationNotFoundError } from '@/lib/server/publications/errors';

export const POST = withApiError(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = flagSetPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? 'Invalid payload', 400);
  }
  try {
    const flag_notes = await setFlag(id, parsed.data);
    return NextResponse.json({ flag_notes });
  } catch (err) {
    if (err instanceof PublicationNotFoundError) {
      return apiError(err.message, 404);
    }
    throw err;
  }
});

export const DELETE = withApiError(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = flagDeletePayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? 'Invalid payload', 400);
  }
  try {
    const flag_notes = await clearFlag(id, parsed.data);
    return NextResponse.json({ flag_notes });
  } catch (err) {
    if (err instanceof PublicationNotFoundError) {
      return apiError(err.message, 404);
    }
    throw err;
  }
});
