import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, socialPosts } from '@/lib/server/db';
import { getSupabaseAdmin } from '@/lib/server/db/supabase';
import { validateParams, withApiError } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { SOCIAL_IMAGE_BUCKET, fetchRemoteImage } from '@/lib/server/social/images';

// Same-origin image endpoint for a post.
//
//  1. Durable path — if the post has a stored object (`image_path`), stream it
//     from the private `social-images` bucket. This is the steady state: the
//     bytes were downloaded once at refresh time, so neither IG signed-URL
//     expiry nor unreachable *.fna.fbcdn.net hosts can break the image.
//  2. Fallback — no stored object yet → proxy the live IG `displayUrl`
//     server-side (no browser Referer, sidesteps hotlink/CSP). Expired or
//     unresolvable hosts return 502 and the client shows its branded
//     placeholder. The fetch is host-allow-listed (cdninstagram/fbcdn) to keep
//     the proxy from becoming an SSRF vector.

const STORED_CACHE = 'public, max-age=31536000, immutable';
const LIVE_CACHE = 'public, max-age=86400, stale-while-revalidate=604800';

export const GET = withApiError(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = validateParams(await params, idParamSchema);

  const row = await db.query.socialPosts.findFirst({
    where: eq(socialPosts.id, id),
    columns: { imageUrl: true, imagePath: true },
  });
  if (!row) return new Response(null, { status: 404 });

  // 1) Durable: stream the stored object from the private bucket.
  if (row.imagePath) {
    try {
      const supa = getSupabaseAdmin();
      const { data, error } = await supa.storage
        .from(SOCIAL_IMAGE_BUCKET)
        .download(row.imagePath);
      if (!error && data) {
        return new Response(data, {
          headers: {
            'Content-Type': data.type || 'image/jpeg',
            'Cache-Control': STORED_CACHE,
          },
        });
      }
    } catch {
      // fall through to the live proxy
    }
  }

  // 2) Fallback: proxy the live IG URL (may 502 → client placeholder).
  if (!row.imageUrl) return new Response(null, { status: 404 });
  const img = await fetchRemoteImage(row.imageUrl);
  if (!img) return new Response(null, { status: 502 });
  return new Response(img.bytes, {
    headers: { 'Content-Type': img.contentType, 'Cache-Control': LIVE_CACHE },
  });
});
