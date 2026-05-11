import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/server/db';
import { apiError } from '@/lib/server/http';
import {
  flagSetPayloadSchema,
  flagDeletePayloadSchema,
} from '@/lib/shared/schemas';
import { setFlag, clearFlag } from '@/lib/server/publications/flag';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
    const flag_notes = await setFlag(id, parsed.data, getSupabaseAdmin());
    return NextResponse.json({ flag_notes });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
    const flag_notes = await clearFlag(id, parsed.data, getSupabaseAdmin());
    return NextResponse.json({ flag_notes });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
