import { NextRequest } from 'next/server';
import { withApiError, validateParams } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireUser } from '@/lib/server/auth/require';
import { getObjectThumbnail } from '@/lib/server/board';

// Same-origin Proxy für Smart-Objekt-Thumbnails (YouTube): gespiegeltes
// MinIO-Objekt, sonst Live-Fetch der allow-listed Snapshot-URL. Kein
// Hotlink im Client → kein IP-Leak an Google, kein 404 bei CDN-Rotation.
export const GET = withApiError(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  const thumb = await getObjectThumbnail(id);
  if (!thumb) return new Response(null, { status: 404 });
  return new Response(thumb.bytes, {
    headers: {
      'Content-Type': thumb.contentType,
      'X-Content-Type-Options': 'nosniff',
      // Öffentliche YouTube-Thumbnails — browser-cachebar, aber privat
      // (auth-gated Route, kein Shared-Cache).
      'Cache-Control': 'private, max-age=86400',
    },
  });
});
