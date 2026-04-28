import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRequest } from '@/lib/api-helpers';

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseFromRequest(req);
    const tables = [
      'publications',
      'persons',
      'orgunits',
      'projects',
      'lectures',
      'extunits',
      'oestat6_categories',
      'person_publications',
      'orgunit_publications',
      'publication_projects',
    ];

    const counts = await Promise.all(
      tables.map(async (t) => {
        const { count, error } = await supabase
          .from(t)
          .select('*', { count: 'exact', head: true });
        return [t, error ? 0 : (count || 0)] as const;
      }),
    );

    const { data: lastSync } = await supabase
      .from('publications')
      .select('synced_at')
      .order('synced_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      publications: counts.find(([t]) => t === 'publications')![1],
      persons: counts.find(([t]) => t === 'persons')![1],
      orgunits: counts.find(([t]) => t === 'orgunits')![1],
      projects: counts.find(([t]) => t === 'projects')![1],
      lectures: counts.find(([t]) => t === 'lectures')![1],
      extunits: counts.find(([t]) => t === 'extunits')![1],
      oestat6: counts.find(([t]) => t === 'oestat6_categories')![1],
      person_publications: counts.find(([t]) => t === 'person_publications')![1],
      orgunit_publications: counts.find(([t]) => t === 'orgunit_publications')![1],
      publication_projects: counts.find(([t]) => t === 'publication_projects')![1],
      last_synced: lastSync?.synced_at || null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
