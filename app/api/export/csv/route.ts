import { NextRequest } from 'next/server';
import { getSupabaseFromRequest, apiError } from '@/lib/api-helpers';
import { Publication } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseFromRequest(req);
    const { searchParams } = new URL(req.url);
    const onlyAnalyzed = searchParams.get('analyzed') !== 'false';

    let query = supabase
      .from('publications')
      .select('*')
      .order('press_score', { ascending: false, nullsFirst: false });

    if (onlyAnalyzed) {
      query = query.eq('analysis_status', 'analyzed');
    }

    const { data, error } = await query;

    if (error) return apiError(error.message, 500);

    const pubs = (data || []) as Publication[];

    const headers = [
      'title', 'authors', 'doi', 'published_at', 'publication_type', 'institute',
      'press_score', 'public_accessibility', 'societal_relevance', 'novelty_factor',
      'storytelling_potential', 'media_timeliness', 'pitch_suggestion', 'target_audience',
      'suggested_angle', 'reasoning', 'llm_model', 'enriched_journal', 'open_access',
    ];

    const csvRows = [headers.join(',')];

    for (const pub of pubs) {
      const row = headers.map(h => {
        const val = pub[h as keyof Publication];
        if (val === null || val === undefined) return '';
        const str = String(val);
        // Escape CSV values
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      csvRows.push(row.join(','));
    }

    const csv = csvRows.join('\n');

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
