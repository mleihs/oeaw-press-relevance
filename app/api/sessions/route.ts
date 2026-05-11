import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/server/http';
import { createSession } from '@/lib/server/sessions/lifecycle';

export async function POST(_req: NextRequest) {
  try {
    const session = await createSession();
    return NextResponse.json({ session });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
