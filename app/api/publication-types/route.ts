import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRequest } from '@/lib/api-helpers';

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseFromRequest(req);

    const { data, error } = await supabase
      .from('publication_types')
      .select('id, webdb_uid, name_de, name_en')
      .order('webdb_uid', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ publication_types: data ?? [], total: data?.length ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
