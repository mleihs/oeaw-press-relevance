import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/server/http';
import { listOrgunits } from '@/lib/server/orgunits/list';

export async function GET(_req: NextRequest) {
  try {
    const result = await listOrgunits();
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
