import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, socialPosts } from '@/lib/server/db';
import { validateParams, withApiError } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';

// Same-origin proxy for a post's Instagram thumbnail. The fbcdn/cdninstagram
// URLs hotlink-block cross-origin <img> requests (Referer-based) and aren't
// guaranteed under any CSP; fetching them server-side (no browser Referer) and
// streaming from our own origin sidesteps both. The id → stored URL lookup
// avoids an open image proxy (no arbitrary ?url= SSRF). Expired signed URLs
// return 502 → the client shows its designed fallback.

// Defense-in-depth: the stored URL still originates from the Apify scraper's
// `displayUrl`, so constrain it to https on the known Instagram CDN hosts before
// fetching. Stops a poisoned `raw.displayUrl` from turning the proxy into an
// SSRF vector against internal/arbitrary hosts.
const ALLOWED_IMAGE_HOST = /(?:^|\.)(?:cdninstagram\.com|fbcdn\.net)$/i;
function isAllowedImageUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  return u.protocol === 'https:' && ALLOWED_IMAGE_HOST.test(u.hostname);
}

export const GET = withApiError(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = validateParams(await params, idParamSchema);

  const row = await db.query.socialPosts.findFirst({
    where: eq(socialPosts.id, id),
    columns: { imageUrl: true },
  });
  if (!row?.imageUrl) return new Response(null, { status: 404 });
  if (!isAllowedImageUrl(row.imageUrl)) return new Response(null, { status: 502 });

  let upstream: Response;
  try {
    upstream = await fetch(row.imageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StoryScout/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return new Response(null, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) return new Response(null, { status: 502 });

  const contentType = upstream.headers.get('content-type') || 'image/jpeg';
  return new Response(upstream.body, {
    headers: {
      'Content-Type': contentType,
      // Cache hard at the edge/browser; the underlying signed URL is stable
      // while valid, and a re-sync replaces the row anyway.
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
});
