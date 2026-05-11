import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRequest } from '@/lib/server/db';
import { apiError } from '@/lib/server/http';
import { getRecentFinishedSession } from '@/lib/server/sessions/lifecycle';

export async function GET(req: NextRequest) {
  try {
    const recent = await getRecentFinishedSession(getSupabaseFromRequest(req));
    return NextResponse.json({ recent });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
