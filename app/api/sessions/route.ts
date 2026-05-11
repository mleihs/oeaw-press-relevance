import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/server/db';
import { apiError } from '@/lib/server/http';
import { createSession } from '@/lib/server/sessions/lifecycle';

export async function POST(_req: NextRequest) {
  try {
    const session = await createSession(getSupabaseAdmin());
    return NextResponse.json({ session });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
