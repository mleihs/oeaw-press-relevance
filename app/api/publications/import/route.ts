import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRequest } from '@/lib/api-helpers';
import { PublicationInsert } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseFromRequest(req);
    const body = await req.json();
    const publications: PublicationInsert[] = body.publications;
    const batchName = body.batch || `import_${new Date().toISOString().slice(0, 10)}`;

    if (!Array.isArray(publications) || publications.length === 0) {
      return NextResponse.json({ error: 'No publications provided' }, { status: 400 });
    }

    let inserted = 0;
    let errors = 0;
    const chunkSize = 100;

    for (let i = 0; i < publications.length; i += chunkSize) {
      const chunk = publications.slice(i, i + chunkSize).map(pub => ({
        ...pub,
        import_batch: batchName,
      }));

      const { error, data } = await supabase
        .from('publications')
        .insert(chunk)
        .select('id');

      if (error) {
        console.error('Insert error:', error);
        errors += chunk.length;
      } else {
        inserted += data?.length || 0;
      }
    }

    return NextResponse.json({
      inserted,
      errors,
      total: publications.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
