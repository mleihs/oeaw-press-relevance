import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db, publications as publicationsTable } from '@/lib/server/db';
import { publicationToApi } from '@/lib/server/publications/to-api';
import { apiError } from '@/lib/server/http';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const onlyAnalyzed = searchParams.get('analyzed') !== 'false';

    const rows = await db
      .select()
      .from(publicationsTable)
      .where(onlyAnalyzed ? eq(publicationsTable.analysisStatus, 'analyzed') : undefined)
      .orderBy(sql`${publicationsTable.pressScore} DESC NULLS LAST`);

    // Run rows through the shared publicationToApi() mapper so the wire shape
    // matches every other publications endpoint (snake_case, ISO-8601, no
    // is_ita_subtree leakage). The old Supabase-JS route returned raw rows,
    // which leaked internal columns.
    const body = JSON.stringify(rows.map(publicationToApi));

    return new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="storyscout-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
