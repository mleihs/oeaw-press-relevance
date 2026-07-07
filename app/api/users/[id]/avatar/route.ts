import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { withApiError, apiError, validateParams } from '@/lib/server/http';
import { idParamSchema } from '@/lib/server/schemas';
import { requireUser } from '@/lib/server/auth/require';
import type { CurrentUser } from '@/lib/shared/types';
import { db, users } from '@/lib/server/db';
import { getObject } from '@/lib/server/storage/s3';
import {
  setUserAvatar,
  clearUserAvatar,
  AvatarError,
  MAX_AVATAR_BYTES,
} from '@/lib/server/users/avatar';

// Same-origin Proxy für Nutzer-Profilbilder (MinIO-Objekt users.avatar_key).
// Auth-gated wie die Objekt-Thumbnails; die URL ist über ?v=<key-hash>
// versioniert (memberRowToApi) → lange cachebar, bricht aber bei Bildwechsel.
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

/** Wer darf das Avatar von [id] ändern: die Person selbst oder ein Admin. */
function canManage(user: CurrentUser, id: string): boolean {
  return user.id === id || user.role === 'admin';
}

function mapAvatarError(err: unknown): Response | null {
  if (!(err instanceof AvatarError)) return null;
  const status = err.reason === 'not_found' ? 404 : err.reason === 'too_large' ? 413 : 400;
  return apiError(err.message, status);
}

// Profilbild hochladen (multipart/form-data, Feld „file"). Selbst-Upload oder
// Admin. Spiegelt den Anhang-Upload-Pfad (Content-Length-Vorabprüfung, dann
// FormData) — bleibt unter Vercels Body-Limit.
export const POST = withApiError(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  if (!canManage(user, id)) return apiError('Kein Zugriff auf dieses Profilbild.', 403);

  const header = req.headers.get('content-length');
  const declared = Number(header);
  if (header === null || !Number.isFinite(declared) || declared < 0) {
    return apiError('Content-Length erforderlich.', 411);
  }
  if (declared > MAX_AVATAR_BYTES + 8192) return apiError('Bild zu groß (max. 2 MB).', 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError('Ungültiger Upload (multipart/form-data erwartet).', 400);
  }
  const file = form.get('file');
  if (!(file instanceof File)) return apiError('Kein „file"-Feld im Upload.', 400);

  const bytes = await file.arrayBuffer();
  try {
    await setUserAvatar(id, { contentType: file.type, bytes });
  } catch (err) {
    const mapped = mapAvatarError(err);
    if (mapped) return mapped;
    throw err;
  }
  return NextResponse.json({ ok: true });
});

// Profilbild entfernen (zurück auf Initialen). Selbst oder Admin.
export const DELETE = withApiError(async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const user = await requireUser();
  const { id } = validateParams(await params, idParamSchema);
  if (!canManage(user, id)) return apiError('Kein Zugriff auf dieses Profilbild.', 403);
  try {
    await clearUserAvatar(id);
  } catch (err) {
    const mapped = mapAvatarError(err);
    if (mapped) return mapped;
    throw err;
  }
  return NextResponse.json({ ok: true });
});
