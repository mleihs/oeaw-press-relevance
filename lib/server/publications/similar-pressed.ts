import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db, publications } from '@/lib/server/db';

// Row shape returned by the similar_pressed_pubs(...) function (see
// supabase/migrations/20260511000001). The function exposes a `kind`
// discriminator so the UI routes matched pubs to /publications/[id] and
// orphans to press_release.url.
export type SimilarPressedRow = {
  kind: 'publication' | 'orphan';
  publication_id: string | null;
  press_release_id: string;
  similarity: number;
  title: string;
  released_at: string | null;
  press_url: string;
};

export interface SimilarPressedResult {
  publication_id: string;
  press_similarity: number | null;
  model: string;
  similar: SimilarPressedRow[];
}

/**
 * The requested pub's own press_similarity plus the top-N historically pressed
 * publications closest in SPECTER2 embedding space (cosine). Feeds the
 * detail-page „Press-Referenz" card. `limit` is expected pre-clamped (1..20).
 */
export async function getSimilarPressed(
  id: string,
  model: string,
  limit: number,
): Promise<SimilarPressedResult> {
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

  return {
    publication_id: id,
    press_similarity: selfRows[0]?.pressSimilarity ?? null,
    model,
    similar: similarRows,
  };
}
