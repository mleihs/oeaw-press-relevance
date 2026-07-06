// Smart-Objekt-Referenzen (BOARD_SMART_OBJECTS.md, P2): n:m-Verknüpfungen
// einer Karte zu Events/Publikationen (Live-Join) und externen Objekten
// (external_objects-Registry, erster Provider YouTube). Eine Zeile in
// card_references = genau EIN Ziel; die Zeilen-id ist der refKey der API.

import 'server-only';

import { eq, sql } from 'drizzle-orm';
import { db, cards, externalObjects } from '@/lib/server/db';
import { getObject, putObject, deleteObjects } from '@/lib/server/storage/s3';
import { log } from '@/lib/server/log';
import type {
  CardReference,
  ReferenceTargetSuggestion,
  YoutubeSnapshot,
} from '@/lib/shared/board';
import type { ReferenceCreatePayload } from '@/lib/shared/board-schemas';
import {
  fetchYoutubeVideo,
  parseYoutubeVideoId,
  youtubeVideoUrl,
} from '@/lib/server/connectors/youtube';
import { CardNotFoundError, ReferenceNotFoundError, ReferenceTargetError } from './errors';
import { writeActivity } from './activity';
import { toIso } from './to-api';

// --- Laden ------------------------------------------------------------------

/** Alle Referenzen einer Karte, ein Query mit Live-Joins, nach created_at. */
export async function loadReferences(cardId: string): Promise<CardReference[]> {
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT r.id, r.created_at,
           r.event_id, e.title AS event_title, e.event_at, e.event_score, e.decision,
           r.publication_id, p.title AS publication_title, p.published_at, p.press_score,
           r.object_id, o.provider, o.url AS object_url, o.snapshot, o.refreshed_at
    FROM card_references r
    LEFT JOIN events e ON e.id = r.event_id
    LEFT JOIN publications p ON p.id = r.publication_id
    LEFT JOIN external_objects o ON o.id = r.object_id
    WHERE r.card_id = ${cardId}
    ORDER BY r.created_at, r.id`);
  return [...rows].map(referenceFromRow);
}

function referenceFromRow(r: Record<string, unknown>): CardReference {
  const base = {
    id: r.id as string,
    created_at: toIso(r.created_at) ?? new Date(0).toISOString(),
  };
  if (r.event_id) {
    return {
      ...base,
      kind: 'event',
      target_id: r.event_id as string,
      title: (r.event_title as string | null) ?? 'Gelöschte Veranstaltung',
      event_at: toIso(r.event_at),
      score: (r.event_score as number | null) ?? null,
      decision: (r.decision as string | null) ?? null,
    };
  }
  if (r.publication_id) {
    return {
      ...base,
      kind: 'publication',
      target_id: r.publication_id as string,
      title: (r.publication_title as string | null) ?? 'Gelöschte Publikation',
      published_at: toIso(r.published_at),
      press_score: (r.press_score as number | null) ?? null,
    };
  }
  const snapshot = (r.snapshot as Partial<YoutubeSnapshot> | null) ?? {};
  return {
    ...base,
    kind: 'youtube',
    target_id: r.object_id as string,
    url: (r.object_url as string | null) ?? null,
    refreshed_at: toIso(r.refreshed_at),
    snapshot: {
      title: snapshot.title ?? 'YouTube-Video',
      channel_title: snapshot.channel_title ?? null,
      published_at: snapshot.published_at ?? null,
      duration_seconds: snapshot.duration_seconds ?? null,
      view_count: snapshot.view_count ?? null,
      thumbnail_url: snapshot.thumbnail_url ?? null,
    },
  };
}

// --- Hinzufügen ---------------------------------------------------------------

async function assertCardExists(cardId: string): Promise<void> {
  const [row] = await db.select({ id: cards.id }).from(cards).where(eq(cards.id, cardId)).limit(1);
  if (!row) throw new CardNotFoundError();
}

/**
 * Referenz anlegen. Intern (event/publication): Ziel-Existenz prüfen, Link
 * einfügen. YouTube: URL parsen → Metadaten ziehen → external_objects
 * upserten (Registry dedupliziert je Video) → Link einfügen. Doppel-Links
 * sind idempotent (ON CONFLICT DO NOTHING, kein zweiter Activity-Eintrag).
 * Gibt die aktualisierte Referenzliste zurück.
 */
export async function addReference(
  userId: string,
  cardId: string,
  payload: ReferenceCreatePayload,
): Promise<CardReference[]> {
  await assertCardExists(cardId);

  let targetCol: 'event_id' | 'publication_id' | 'object_id';
  let targetId: string;
  let activityTitle: string;

  if (payload.kind === 'event') {
    const [row] = await db.execute<{ title: string }>(
      sql`SELECT title FROM events WHERE id = ${payload.id}`,
    );
    if (!row) throw new ReferenceTargetError('Veranstaltung nicht gefunden.');
    targetCol = 'event_id';
    targetId = payload.id;
    activityTitle = row.title;
  } else if (payload.kind === 'publication') {
    const [row] = await db.execute<{ title: string }>(
      sql`SELECT title FROM publications WHERE id = ${payload.id}`,
    );
    if (!row) throw new ReferenceTargetError('Publikation nicht gefunden.');
    targetCol = 'publication_id';
    targetId = payload.id;
    activityTitle = row.title;
  } else {
    const videoId = parseYoutubeVideoId(payload.url);
    if (!videoId) {
      throw new ReferenceTargetError('Keine gültige YouTube-URL oder Video-ID.');
    }
    const snapshot = await fetchYoutubeVideo(videoId);
    if (!snapshot) {
      throw new ReferenceTargetError('YouTube-Video nicht gefunden (privat oder gelöscht?).');
    }
    targetCol = 'object_id';
    targetId = await upsertYoutubeObject(videoId, snapshot);
    activityTitle = snapshot.title;
  }

  const inserted = await db.execute<{ id: string }>(sql`
    INSERT INTO card_references (card_id, ${sql.raw(targetCol)}, created_by)
    VALUES (${cardId}, ${targetId}, ${userId})
    ON CONFLICT DO NOTHING
    RETURNING id`);
  if (inserted.length > 0) {
    await writeActivity(cardId, userId, 'reference_added', {
      kind: payload.kind,
      title: activityTitle,
    });
  }
  return loadReferences(cardId);
}

/** Snapshot in die Registry schreiben (dedupliziert je provider+external_id)
 *  und das Thumbnail best-effort nach MinIO spiegeln. Liefert die Objekt-ID. */
async function upsertYoutubeObject(videoId: string, snapshot: YoutubeSnapshot): Promise<string> {
  const [obj] = await db
    .insert(externalObjects)
    .values({
      provider: 'youtube',
      externalId: videoId,
      url: youtubeVideoUrl(videoId),
      snapshot,
    })
    .onConflictDoUpdate({
      target: [externalObjects.provider, externalObjects.externalId],
      set: { snapshot, refreshedAt: new Date().toISOString() },
    })
    .returning({ id: externalObjects.id, thumbnailKey: externalObjects.thumbnailKey });
  if (!obj.thumbnailKey && snapshot.thumbnail_url) {
    await mirrorThumbnail(obj.id, snapshot.thumbnail_url);
  }
  return obj.id;
}

// --- Entfernen ---------------------------------------------------------------

/**
 * Referenz lösen. Hinterlässt das externe Objekt nur, solange es andere
 * Karten referenzieren — sonst wird es samt gespiegeltem Thumbnail geräumt
 * (Invariante: Objekt existiert ⇔ mindestens ein Link).
 */
export async function removeReference(
  userId: string,
  cardId: string,
  referenceId: string,
): Promise<CardReference[]> {
  const refs = await loadReferences(cardId);
  const ref = refs.find((r) => r.id === referenceId);
  if (!ref) throw new ReferenceNotFoundError();

  await db.execute(sql`DELETE FROM card_references WHERE id = ${referenceId}`);
  await writeActivity(cardId, userId, 'reference_removed', {
    kind: ref.kind,
    title: ref.kind === 'youtube' ? ref.snapshot.title : ref.title,
  });

  if (ref.kind === 'youtube') {
    await cleanupOrphanObject(ref.target_id);
  }
  return refs.filter((r) => r.id !== referenceId);
}

/** Externes Objekt ohne verbleibende Links löschen (best-effort inkl. MinIO). */
async function cleanupOrphanObject(objectId: string): Promise<void> {
  const stillLinked = await db.execute<{ n: number }>(
    sql`SELECT 1 AS n FROM card_references WHERE object_id = ${objectId} LIMIT 1`,
  );
  if (stillLinked.length > 0) return;
  const [obj] = await db
    .delete(externalObjects)
    .where(eq(externalObjects.id, objectId))
    .returning({ thumbnailKey: externalObjects.thumbnailKey });
  if (obj?.thumbnailKey) {
    await deleteObjects([obj.thumbnailKey]).catch(() => {});
  }
}

// --- Aktualisieren -------------------------------------------------------------

/**
 * YouTube-Snapshot einer Referenz neu ziehen („Aktualisieren"-Knopf).
 * Interne Referenzen sind immer live — dort ist Refresh ein No-op-Fehler.
 */
export async function refreshReference(
  cardId: string,
  referenceId: string,
): Promise<CardReference[]> {
  const rows = await db.execute<{ object_id: string | null; external_id: string | null }>(sql`
    SELECT r.object_id, o.external_id
    FROM card_references r
    LEFT JOIN external_objects o ON o.id = r.object_id
    WHERE r.id = ${referenceId} AND r.card_id = ${cardId}`);
  const row = rows[0];
  if (!row) throw new ReferenceNotFoundError();
  if (!row.object_id || !row.external_id) {
    throw new ReferenceTargetError('Nur externe Objekte (YouTube) lassen sich aktualisieren.');
  }

  const snapshot = await fetchYoutubeVideo(row.external_id);
  if (!snapshot) {
    throw new ReferenceTargetError('YouTube-Video nicht mehr erreichbar.');
  }
  await db
    .update(externalObjects)
    .set({ snapshot, refreshedAt: new Date().toISOString() })
    .where(eq(externalObjects.id, row.object_id));
  if (snapshot.thumbnail_url) {
    await mirrorThumbnail(row.object_id, snapshot.thumbnail_url);
  }
  return loadReferences(cardId);
}

// --- Thumbnail-Mirror (MinIO) --------------------------------------------------

/** Key-Präfix der gespiegelten Objekt-Thumbnails im Projekt-Bucket. */
export const BOARD_OBJECT_THUMB_PREFIX = 'board/objects';

export function thumbnailKeyForObject(objectId: string): string {
  return `${BOARD_OBJECT_THUMB_PREFIX}/${objectId}.jpg`;
}

// Nur YouTube-CDN-Hosts serverseitig fetchen (SSRF-Guard wie bei den
// Social-Bildern, lib/server/social/images.ts).
const ALLOWED_THUMB_HOST = /(?:^|\.)(?:ytimg\.com|youtube\.com|ggpht\.com)$/i;

export function isAllowedThumbnailUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  return u.protocol === 'https:' && ALLOWED_THUMB_HOST.test(u.hostname);
}

/**
 * Thumbnail nach MinIO spiegeln und thumbnail_key setzen. Vollständig
 * non-fatal (kein Storage konfiguriert / Host nicht erlaubt / Fetch-Fehler →
 * Anzeige fällt auf den Live-Proxy der Quell-URL zurück).
 */
async function mirrorThumbnail(objectId: string, thumbnailUrl: string): Promise<void> {
  if (!isAllowedThumbnailUrl(thumbnailUrl)) return;
  try {
    const res = await fetch(thumbnailUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return;
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) return;
    const key = thumbnailKeyForObject(objectId);
    await putObject(key, await res.arrayBuffer(), contentType);
    await db
      .update(externalObjects)
      .set({ thumbnailKey: key })
      .where(eq(externalObjects.id, objectId));
  } catch (err) {
    log.warn('board_object_thumbnail_mirror_error', {
      object_id: objectId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface ObjectThumbnail {
  bytes: ArrayBuffer;
  contentType: string;
}

/**
 * Thumbnail-Bytes fürs Serving (Route /api/board/objects/[id]/thumbnail):
 * gespiegeltes MinIO-Objekt, sonst Live-Fetch der Snapshot-URL (allow-listed).
 * null = Objekt unbekannt oder kein Bild verfügbar.
 */
export async function getObjectThumbnail(objectId: string): Promise<ObjectThumbnail | null> {
  const [obj] = await db
    .select({ thumbnailKey: externalObjects.thumbnailKey, snapshot: externalObjects.snapshot })
    .from(externalObjects)
    .where(eq(externalObjects.id, objectId))
    .limit(1);
  if (!obj) return null;

  if (obj.thumbnailKey) {
    try {
      const stored = await getObject(obj.thumbnailKey);
      if (stored) return stored;
    } catch (err) {
      log.warn('board_object_thumbnail_read_error', {
        object_id: objectId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const url = (obj.snapshot as Partial<YoutubeSnapshot>).thumbnail_url;
  if (!url || !isAllowedThumbnailUrl(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) return null;
    return { bytes: await res.arrayBuffer(), contentType };
  } catch {
    return null;
  }
}

// --- Picker-Suche (interne Ziele) -----------------------------------------------

/**
 * Live-Suche für den Picker: Titel-Substring, neueste zuerst. Leere Query →
 * die jüngsten Einträge (sinnvoller Default beim Öffnen des Tabs).
 */
export async function searchReferenceTargets(
  kind: 'event' | 'publication',
  query: string,
  limit = 8,
): Promise<ReferenceTargetSuggestion[]> {
  const pattern = `%${query.trim().toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  if (kind === 'event') {
    const rows = await db.execute<Record<string, unknown>>(sql`
      SELECT id, title, event_at AS date, event_score AS score, decision
      FROM events
      WHERE lower(title) LIKE ${pattern} ESCAPE '\\'
      ORDER BY event_at DESC
      LIMIT ${limit}`);
    return [...rows].map(suggestionFromRow);
  }
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT id, title, published_at AS date, press_score AS score, NULL AS decision
    FROM publications
    WHERE lower(title) LIKE ${pattern} ESCAPE '\\'
    ORDER BY published_at DESC NULLS LAST
    LIMIT ${limit}`);
  return [...rows].map(suggestionFromRow);
}

function suggestionFromRow(r: Record<string, unknown>): ReferenceTargetSuggestion {
  return {
    id: r.id as string,
    title: r.title as string,
    date: toIso(r.date),
    score: (r.score as number | null) ?? null,
    decision: (r.decision as string | null) ?? null,
  };
}
