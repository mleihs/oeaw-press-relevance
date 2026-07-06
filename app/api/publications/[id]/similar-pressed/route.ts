import { NextRequest, NextResponse } from 'next/server';
import { validateParams, validateQuery, withApiError } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { similarPressedQuerySchema } from '@/lib/shared/schemas';
import { getSimilarPressed } from '@/lib/server/publications/similar-pressed';

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
export const GET = withApiError(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = validateParams(await params, idParamSchema);
  const q = validateQuery(
    new URL(req.url).searchParams,
    similarPressedQuerySchema,
  );
  // 1..20 clamp stays in the route (faithful to the prior min/max), the schema
  // only guarantees `limit` is a positive int (no NaN reaches SQL).
  const limit = Math.min(20, Math.max(1, q.limit));

  return NextResponse.json(await getSimilarPressed(id, q.model, limit));
});
