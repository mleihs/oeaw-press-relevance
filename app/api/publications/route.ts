import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRequest } from '@/lib/api-helpers';

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseFromRequest(req);
    const { searchParams } = new URL(req.url);

    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const search = searchParams.get('search') || '';
    const enrichmentStatus = searchParams.get('enrichment_status') || '';
    const analysisStatus = searchParams.get('analysis_status') || '';
    const publicationType = searchParams.get('publication_type') || '';
    const publishedAfter = searchParams.get('published_after') || '';
    const minScore = searchParams.get('min_score') || '';
    const sortBy = searchParams.get('sort') || 'created_at';
    const sortOrder = searchParams.get('order') === 'asc' ? true : false;
    const statsOnly = searchParams.get('stats') === 'true';

    if (statsOnly) {
      const { count: total } = await supabase
        .from('publications')
        .select('*', { count: 'exact', head: true });

      const { count: enriched } = await supabase
        .from('publications')
        .select('*', { count: 'exact', head: true })
        .eq('enrichment_status', 'enriched');

      const { count: partialCount } = await supabase
        .from('publications')
        .select('*', { count: 'exact', head: true })
        .eq('enrichment_status', 'partial');

      const { count: withAbstractCount } = await supabase
        .from('publications')
        .select('*', { count: 'exact', head: true })
        .not('enriched_abstract', 'is', null);

      const { count: analyzed } = await supabase
        .from('publications')
        .select('*', { count: 'exact', head: true })
        .eq('analysis_status', 'analyzed');

      // Fetch ALL scores — paginate past Supabase's 1000-row default limit
      const allScores: number[] = [];
      const batchSize = 1000;
      for (let offset = 0; ; offset += batchSize) {
        const { data: batch } = await supabase
          .from('publications')
          .select('press_score')
          .eq('analysis_status', 'analyzed')
          .not('press_score', 'is', null)
          .range(offset, offset + batchSize - 1);
        if (!batch || batch.length === 0) break;
        allScores.push(...batch.map(d => d.press_score as number));
        if (batch.length < batchSize) break;
      }

      let avgScore: number | null = null;
      let highScoreCount = 0;
      const scoreDistribution = new Array(10).fill(0);
      if (allScores.length > 0) {
        avgScore = allScores.reduce((a, b) => a + b, 0) / allScores.length;
        highScoreCount = allScores.filter(s => s >= 0.6).length;
        for (const s of allScores) {
          const idx = Math.min(9, Math.floor(s * 10));
          scoreDistribution[idx]++;
        }
      }

      return NextResponse.json({
        total: total || 0,
        enriched: enriched || 0,
        partial: partialCount || 0,
        with_abstract: withAbstractCount || 0,
        analyzed: analyzed || 0,
        avg_score: avgScore,
        high_score_count: highScoreCount,
        score_distribution: scoreDistribution,
      });
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('publications')
      .select('*', { count: 'exact' });

    if (search) {
      query = query.ilike('title', `%${search}%`);
    }
    if (enrichmentStatus) {
      query = query.eq('enrichment_status', enrichmentStatus);
    }
    if (analysisStatus) {
      query = query.eq('analysis_status', analysisStatus);
    }
    if (publicationType) {
      query = query.eq('publication_type', publicationType);
    }
    if (publishedAfter) {
      query = query.gte('published_at', publishedAfter);
    }
    if (minScore) {
      query = query.gte('press_score', parseFloat(minScore));
    }

    query = query.order(sortBy, { ascending: sortOrder }).range(from, to);

    const { data, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      publications: data || [],
      total: count || 0,
      page,
      pageSize,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
