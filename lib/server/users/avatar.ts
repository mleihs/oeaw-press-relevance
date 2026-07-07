import 'server-only';

import { eq } from 'drizzle-orm';
import { db, users } from '@/lib/server/db';
import { putObject, deleteObjects } from '@/lib/server/storage/s3';

/** Obergrenze fürs Profilbild (Bytes). Kleiner als Anhänge (2 MB) — Avatare
 *  werden client-seitig ohnehin klein gerendert, und es bleibt unter Vercels
 *  ~4,5-MB-Body-Limit beim server-proxierten Upload. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** Zulässige Bildtypen. SVG bewusst NICHT — skriptfähig (XSS), wie bei den
 *  Anhängen (lib/server/board/attachments.ts). */
export const ALLOWED_AVATAR_TYPES = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export type AvatarRejectReason = 'empty' | 'too_large' | 'bad_type' | 'not_found';

/** Fachlicher Fehler des Avatar-Pfads; die Route mappt `reason` auf HTTP. */
export class AvatarError extends Error {
  constructor(
    public readonly reason: AvatarRejectReason,
    message: string,
  ) {
    super(message);
    this.name = 'AvatarError';
  }
}

/**
 * Neues Profilbild ablegen: Objekt in MinIO schreiben, users.avatar_key
 * umbiegen, altes Objekt best-effort aufräumen (kein verwaistes Objekt pro
 * Wechsel). Gibt den neuen Storage-Key zurück. Neuer, eindeutiger Key je
 * Upload — spielt sauber mit der proxy-seitigen Zwischenspeicherung zusammen.
 */
export async function setUserAvatar(
  userId: string,
  input: { contentType: string; bytes: ArrayBuffer },
): Promise<string> {
  const ext = EXT_BY_TYPE[input.contentType];
  if (!ext) throw new AvatarError('bad_type', 'Nur PNG, JPEG, WebP oder GIF.');
  if (input.bytes.byteLength === 0) throw new AvatarError('empty', 'Leere Datei.');
  if (input.bytes.byteLength > MAX_AVATAR_BYTES) {
    throw new AvatarError('too_large', 'Bild zu groß (max. 2 MB).');
  }

  const key = `avatars/${userId}-${crypto.randomUUID()}.${ext}`;
  await putObject(key, input.bytes, input.contentType);

  const [row] = await db
    .select({ old: users.avatarKey })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) {
    // Konto verschwand zwischen Auth und Update → gerade geschriebenes Objekt
    // nicht verwaisen lassen.
    await deleteObjects([key]).catch(() => {});
    throw new AvatarError('not_found', 'Konto nicht gefunden.');
  }
  await db.update(users).set({ avatarKey: key }).where(eq(users.id, userId));
  if (row.old && row.old !== key) await deleteObjects([row.old]).catch(() => {});
  return key;
}

/** Profilbild entfernen: Key auf NULL, Objekt best-effort löschen. Idempotent
 *  (kein Bild → no-op). */
export async function clearUserAvatar(userId: string): Promise<void> {
  const [row] = await db
    .select({ old: users.avatarKey })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) throw new AvatarError('not_found', 'Konto nicht gefunden.');
  if (!row.old) return;
  await db.update(users).set({ avatarKey: null }).where(eq(users.id, userId));
  await deleteObjects([row.old]).catch(() => {});
}
