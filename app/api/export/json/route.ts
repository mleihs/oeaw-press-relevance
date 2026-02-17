import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRequest } from '@/lib/api-helpers';

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

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return new Response(JSON.stringify(data || [], null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="oeaw-press-relevance-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
