import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/server/http';
import { getRecentFinishedSession } from '@/lib/server/sessions/lifecycle';

export async function GET(_req: NextRequest) {
  try {
    const recent = await getRecentFinishedSession();
    return NextResponse.json({ recent });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
