import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRequest } from '@/lib/server/api-helpers';
import { listPublications } from '@/lib/server/publications/list';

export async function GET(req: NextRequest) {
  try {
    const result = await listPublications(
      new URL(req.url).searchParams,
      getSupabaseFromRequest(req),
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
