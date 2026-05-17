import { NextRequest, NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db, publications } from '@/lib/server/db';
import { validateParams, validateQuery, withApiError } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { similarPressedQuerySchema } from '@/lib/shared/schemas';

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

// Row shape returned by the similar_pressed_pubs(...) function (see
// supabase/migrations/20260511000001). The function exposes a `kind`
// discriminator so the UI routes matched pubs to /publications/[id] and
// orphans to press_release.url.
type SimilarPressedRow = {
  kind: 'publication' | 'orphan';
  publication_id: string | null;
  press_release_id: string;
  similarity: number;
  title: string;
  released_at: string | null;
  press_url: string;
};

export const GET = withApiError(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = validateParams(await params, idParamSchema);
  const q = validateQuery(
    new URL(req.url).searchParams,
    similarPressedQuerySchema,
  );
  // 1..20 clamp stays in the route (faithful to the prior min/max), the
  // schema only guarantees `limit` is a positive int (no NaN reaches SQL).
  const limit = Math.min(20, Math.max(1, q.limit));
  const model = q.model;

  const [selfRows, similarRows] = await Promise.all([
    db
      .select({ pressSimilarity: publications.pressSimilarity })
      .from(publications)
      .where(eq(publications.id, id))
      .limit(1),
    db.execute<SimilarPressedRow>(
      sql`SELECT kind, publication_id, press_release_id, similarity, title, released_at, press_url
          FROM similar_pressed_pubs(${id}::uuid, ${model}, ${limit})`,
    ),
  ]);

  return NextResponse.json({
    publication_id: id,
    press_similarity: selfRows[0]?.pressSimilarity ?? null,
    model,
    similar: similarRows,
  });
});
