import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import {
  db,
  publications as publicationsTable,
  descNullsLast,
} from '@/lib/server/db';
import { publicationToApi } from '@/lib/server/publications/to-api';
import { validateQuery, withApiError } from '@/lib/server/http';
import { analyzedExportQuerySchema } from '@/lib/shared/schemas';

export const GET = withApiError(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const { analyzed: onlyAnalyzed } = validateQuery(
    searchParams,
    analyzedExportQuerySchema,
  );

  const rows = await db
    .select()
    .from(publicationsTable)
    .where(onlyAnalyzed ? eq(publicationsTable.analysisStatus, 'analyzed') : undefined)
    .orderBy(descNullsLast(publicationsTable.pressScore));

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
});
