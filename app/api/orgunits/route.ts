import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRequest } from '@/lib/server/db';
import { listOrgunits } from '@/lib/server/orgunits/list';

export async function GET(req: NextRequest) {
  try {
    const result = await listOrgunits(getSupabaseFromRequest(req));
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
