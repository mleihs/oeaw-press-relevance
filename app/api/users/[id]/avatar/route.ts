import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { withApiError, validateParams } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireUser } from '@/lib/server/auth/require';
import { db, users } from '@/lib/server/db';
import { getObject } from '@/lib/server/storage/s3';

// Same-origin Proxy für Nutzer-Profilbilder (MinIO-Objekt users.avatar_key,
// importiert aus MeisterTask). Auth-gated wie die Objekt-Thumbnails; die
// Bilder ändern sich praktisch nie → lang browser-cachebar, aber privat.
export const GET = withApiError(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  const [row] = await db
    .select({ avatarKey: users.avatarKey })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!row?.avatarKey) return new Response(null, { status: 404 });
  const obj = await getObject(row.avatarKey);
  if (!obj) return new Response(null, { status: 404 });
  return new Response(obj.bytes, {
    headers: {
      'Content-Type': obj.contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=86400',
    },
  });
});
