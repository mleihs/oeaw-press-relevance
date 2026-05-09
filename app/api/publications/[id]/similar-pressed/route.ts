import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRequest } from '@/lib/api-helpers';

/**
 * GET /api/publications/:id/similar-pressed
 *
 * Returns the press_similarity score for the requested pub plus the
 * top-N historically pressed publications closest in SPECTER2 embedding
 * space (cosine). Used by the detail-page "Press-Referenz" card.
 *
 * Query params:
 *   limit  : 1..20 (default 3)
 *   model  : embedding model identifier (default allenai/specter2_base)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get('limit') ?? '3', 10) || 3));
    const model = url.searchParams.get('model') ?? 'allenai/specter2_base';

    const supabase = getSupabaseFromRequest(req);

    const [self, similar] = await Promise.all([
      supabase
        .from('publications')
        .select('id, press_similarity')
        .eq('id', id)
        .maybeSingle(),
      supabase.rpc('similar_pressed_pubs', {
        p_pub_id: id,
        p_model: model,
        p_limit: limit,
      }),
    ]);

    if (self.error) {
      return NextResponse.json({ error: self.error.message }, { status: 500 });
    }

    return NextResponse.json({
      publication_id: id,
      press_similarity: self.data?.press_similarity ?? null,
      model,
      similar: similar.error ? [] : (similar.data ?? []),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
