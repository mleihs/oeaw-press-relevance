import 'server-only';

import { asc, eq } from 'drizzle-orm';
import { db, cards, cardAttachments } from '@/lib/server/db';
import type { CardAttachment } from '@/lib/shared/board';
import { MAX_ATTACHMENT_BYTES } from '@/lib/shared/board';
import type { CurrentUser } from '@/lib/shared/types';
import { putObject, deleteObjects } from '@/lib/server/storage/s3';
import {
  CardNotFoundError,
  AttachmentNotFoundError,
  AttachmentRejectedError,
  BoardForbiddenError,
} from './errors';
import { writeActivity } from './activity';
import { toIso } from './to-api';

// MAX_ATTACHMENT_BYTES lebt in lib/shared/board.ts (geteilt mit dem UI-Hinweis);
// hier re-exportiert, damit der Serverpfad + die API-Route eine Import-Fläche
// haben. Bewusst konservativ wegen Vercels ~4,5-MB-Body-Limit (server-proxierter
// Upload). Größere Dateien bräuchten Presigned-PUT-URLs gegen MinIO (Follow-up).
export { MAX_ATTACHMENT_BYTES };

/** Zulässige Inhaltstypen. SVG bewusst NICHT — es ist skriptfähig und würde
 *  inline im Browser ausgeführt (XSS). */
export const ALLOWED_ATTACHMENT_TYPES = new Set<string>([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

/** Inhaltstypen, die die Download-Route inline ausliefern darf (alles andere
 *  erzwingt Content-Disposition: attachment). Nur unkritische Rasterbilder. */
export const INLINE_ATTACHMENT_TYPES = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

/** Endung -> Inhaltstyp (Teilmenge von ALLOWED_ATTACHMENT_TYPES). Fallback,
 *  wenn der Browser bei Office-/Text-Dateien einen leeren oder generischen
 *  content-type meldet (Windows ohne registrierten MIME-Handler → .docx/.csv
 *  kämen sonst als 415 zurück). */
const EXTENSION_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  csv: 'text/csv',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

function toApi(row: typeof cardAttachments.$inferSelect): CardAttachment {
  return {
    id: row.id,
    card_id: row.cardId,
    filename: row.filename,
    content_type: row.contentType,
    size_bytes: row.sizeBytes,
    uploaded_by: row.uploadedBy,
    created_at: toIso(row.createdAt) ?? new Date(0).toISOString(),
  };
}

/** Dateiname für den S3-Key entschärfen: nur Basename, harmlose Zeichen.
 *  NUR für den Key — der Anzeigename bleibt UTF-8 (displayName), sonst
 *  würden Umlaute dauerhaft zu '_' verstümmelt. */
function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'datei';
  return base.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'datei';
}

/** Anzeigename: Basename, getrimmt, längenbegrenzt — Umlaute bleiben.
 *  Die Download-Route setzt Content-Disposition RFC-5987-konform (UTF-8). */
function displayName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? '').trim();
  return base.slice(0, 160) || 'datei';
}

export async function loadAttachments(cardId: string): Promise<CardAttachment[]> {
  const rows = await db
    .select()
    .from(cardAttachments)
    .where(eq(cardAttachments.cardId, cardId))
    .orderBy(asc(cardAttachments.createdAt), asc(cardAttachments.id));
  return rows.map(toApi);
}

export async function addAttachment(
  userId: string,
  cardId: string,
  file: { filename: string; contentType: string; bytes: ArrayBuffer },
): Promise<CardAttachment> {
  const [c] = await db.select({ id: cards.id }).from(cards).where(eq(cards.id, cardId)).limit(1);
  if (!c) throw new CardNotFoundError();

  const size = file.bytes.byteLength;
  if (size === 0) throw new AttachmentRejectedError('Leere Datei.', 400);
  if (size > MAX_ATTACHMENT_BYTES) {
    const mb = (MAX_ATTACHMENT_BYTES / (1024 * 1024)).toFixed(0);
    throw new AttachmentRejectedError(`Datei zu groß (max. ${mb} MB).`, 413);
  }
  let contentType = (file.contentType || '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_ATTACHMENT_TYPES.has(contentType)) {
    // Leerer/generischer content-type: gegen die Endung auflösen, bevor wir
    // eine an sich erlaubte Datei fälschlich ablehnen.
    if (!contentType || contentType === 'application/octet-stream') {
      const mapped = EXTENSION_TYPES[extensionOf(file.filename)];
      if (mapped) contentType = mapped;
    }
    if (!ALLOWED_ATTACHMENT_TYPES.has(contentType)) {
      throw new AttachmentRejectedError('Dateityp nicht erlaubt (PDF, Office, Text, Bild).', 415);
    }
  }

  const id = crypto.randomUUID();
  const s3Key = `board/attachments/${cardId}/${id}-${safeName(file.filename)}`;

  await putObject(s3Key, file.bytes, contentType);
  try {
    const [row] = await db
      .insert(cardAttachments)
      .values({
        id,
        cardId,
        filename: displayName(file.filename),
        s3Key,
        contentType,
        sizeBytes: size,
        uploadedBy: userId,
      })
      .returning();
    await writeActivity(cardId, userId, 'attachment_added', {
      attachment_id: id,
      filename: row.filename,
    });
    return toApi(row);
  } catch (err) {
    // Insert scheiterte nach dem Upload -> verwaistes Objekt best-effort räumen.
    await deleteObjects([s3Key]).catch(() => {});
    throw err;
  }
}

/** Roh-Row inkl. s3_key für die Proxy-Auslieferung (nie ans Wire-DTO). */
export async function getAttachmentObject(
  id: string,
): Promise<{ s3Key: string; contentType: string | null; filename: string }> {
  const [row] = await db
    .select({
      s3Key: cardAttachments.s3Key,
      contentType: cardAttachments.contentType,
      filename: cardAttachments.filename,
    })
    .from(cardAttachments)
    .where(eq(cardAttachments.id, id))
    .limit(1);
  if (!row) throw new AttachmentNotFoundError();
  return row;
}

/** Urheber oder Admin darf löschen. Entfernt Objekt UND Zeile. */
export async function deleteAttachment(user: CurrentUser, id: string): Promise<void> {
  const [row] = await db
    .select({ uploadedBy: cardAttachments.uploadedBy, s3Key: cardAttachments.s3Key })
    .from(cardAttachments)
    .where(eq(cardAttachments.id, id))
    .limit(1);
  if (!row) throw new AttachmentNotFoundError();
  if (row.uploadedBy !== user.id && user.role !== 'admin') throw new BoardForbiddenError();

  await db.delete(cardAttachments).where(eq(cardAttachments.id, id));
  // Objekt best-effort löschen — die DB-Zeile ist die Wahrheit; ein
  // verwaistes Objekt ist tolerierbar, ein toter DB-Verweis wäre schlimmer.
  await deleteObjects([row.s3Key]).catch(() => {});
}
