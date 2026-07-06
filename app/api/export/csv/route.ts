import { NextRequest } from 'next/server';
import { validateQuery, withApiError } from '@/lib/server/http';
import { analyzedExportQuerySchema } from '@/lib/shared/schemas';
import { fetchAnalyzedExportRows } from '@/lib/server/publications/export';

// CSV column whitelist — mirrors the Publication wire-shape names. Listed
// explicitly so a schema rename surfaces here as a tsc error (the row[h] index
// is typed against the projected select shape).
const COLUMNS = [
  'title', 'authors', 'doi', 'published_at', 'publication_type', 'institute',
  'press_score', 'public_accessibility', 'societal_relevance', 'novelty_factor',
  'storytelling_potential', 'media_timeliness', 'pitch_suggestion', 'target_audience',
  'suggested_angle', 'reasoning', 'llm_model', 'enriched_journal', 'open_access',
] as const;

function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = typeof val === 'string' ? val : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export const GET = withApiError(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const { analyzed: onlyAnalyzed } = validateQuery(
    searchParams,
    analyzedExportQuerySchema,
  );

  const rows = await fetchAnalyzedExportRows(onlyAnalyzed);

  const lines: string[] = [COLUMNS.join(',')];
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    lines.push(COLUMNS.map((h) => escapeCsv(r[h])).join(','));
  }
  const csv = lines.join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="storyscout-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
