import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/server/db';
import { apiError } from '@/lib/server/http';
import type { ResearcherDetail } from '@/lib/shared/researchers';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return apiError('invalid person id', 400);
  }

  const u = req.nextUrl.searchParams;
  const since = u.get('since');
  if (!since || !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    return apiError('since must be YYYY-MM-DD', 400);
  }

  const excludeIta = u.get('exclude_ita') !== 'false';
  const excludeOutreach = u.get('exclude_outreach') !== 'false';

  try {
    const rows = (await db.execute(
      sql`SELECT person, stats, activity, coauthors, publications
          FROM researcher_detail(${id}::uuid, ${since}::date, ${excludeIta}, ${excludeOutreach})`,
    )) as unknown as ResearcherDetail[];

    const row = rows[0] ?? null;
    if (!row || !row.person) {
      return apiError('person not found', 404);
    }
    return NextResponse.json(row);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
