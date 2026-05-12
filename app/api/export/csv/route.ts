import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import {
  db,
  publications as publicationsTable,
  descNullsLast,
} from '@/lib/server/db';
import { apiError } from '@/lib/server/http';

// CSV column whitelist — mirrors the Publication wire-shape names. Listed
// explicitly so a schema rename surfaces here as a tsc error (the row[h] index
// is typed against the table's $inferSelect after the toApi-like mapping).
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const onlyAnalyzed = searchParams.get('analyzed') !== 'false';

    // Project only the columns the CSV uses. NULLS LAST so analysed pubs with
    // no score still land at the bottom (vs. PostgREST's nullsFirst:false sort).
    const rows = await db
      .select({
        title: publicationsTable.title,
        // authors / institute are not in the publications table — the previous
        // Supabase-JS version `select('*')` happened to return undefined for
        // these fields, which then serialised as empty cells. Keep the same
        // behaviour by emitting nulls for them.
        doi: publicationsTable.doi,
        published_at: publicationsTable.publishedAt,
        publication_type: publicationsTable.publicationType,
        press_score: publicationsTable.pressScore,
        public_accessibility: publicationsTable.publicAccessibility,
        societal_relevance: publicationsTable.societalRelevance,
        novelty_factor: publicationsTable.noveltyFactor,
        storytelling_potential: publicationsTable.storytellingPotential,
        media_timeliness: publicationsTable.mediaTimeliness,
        pitch_suggestion: publicationsTable.pitchSuggestion,
        target_audience: publicationsTable.targetAudience,
        suggested_angle: publicationsTable.suggestedAngle,
        reasoning: publicationsTable.reasoning,
        llm_model: publicationsTable.llmModel,
        enriched_journal: publicationsTable.enrichedJournal,
        open_access: publicationsTable.openAccess,
      })
      .from(publicationsTable)
      .where(onlyAnalyzed ? eq(publicationsTable.analysisStatus, 'analyzed') : undefined)
      .orderBy(descNullsLast(publicationsTable.pressScore));

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
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
