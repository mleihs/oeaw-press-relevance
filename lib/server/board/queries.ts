import 'server-only';

import { sql } from 'drizzle-orm';
import { db } from '@/lib/server/db';
import type { ArchivedCard, BoardCardRef, BoardDashboardCards } from '@/lib/shared/board';
import { toIso } from './to-api';

/**
 * Board-übergreifende Karten-Queries (Phase 4). Anders als die per-Board-Loads
 * (boards.ts) scannen diese ALLE nicht-archivierten Boards und liefern den
 * Board-Slug für den Deep-Link mit. Board-Sichtbarkeit ist im Modell
 * team-weit (RLS authenticated_select using true) — es gibt keine privaten
 * Boards, daher kein per-User-Filter; archivierte Boards bleiben außen vor.
 */

/** Gemeinsame Projektion cards -> BoardCardRef (mit Board-/Spaltennamen). */
const CARD_REF_COLUMNS = sql`
  c.id, c.title, c.due_at, c.completed_at, c.created_at,
  b.slug AS board_slug, b.name AS board_name, col.name AS column_name,
  col.color AS column_color`;

function cardRefFromRow(r: Record<string, unknown>): BoardCardRef {
  return {
    id: r.id as string,
    title: r.title as string,
    board_slug: r.board_slug as string,
    board_name: r.board_name as string,
    column_name: (r.column_name as string | null) ?? null,
    column_color: (r.column_color as string | null) ?? null,
    due_at: toIso(r.due_at),
    completed_at: toIso(r.completed_at),
    created_at: toIso(r.created_at) ?? new Date(0).toISOString(),
  };
}

/** Dashboard-Kachel: überfällige + demnächst fällige (offene) + zuletzt
 *  angelegte Karten. Je Gruppe begrenzt. */
export async function getBoardDashboardCards(perGroup = 6): Promise<BoardDashboardCards> {
  // Archivierte Karten (Feature 4) sind aus allen board-übergreifenden Listen
  // raus — als JOIN-Bedingung, damit die nachgelagerten WHERE-Klauseln der
  // einzelnen Dashboard-Queries unverändert greifen.
  const base = sql`
    FROM cards c
    JOIN boards b ON b.id = c.board_id AND b.archived_at IS NULL
    JOIN board_columns col ON col.id = c.column_id
    AND c.archived_at IS NULL`;

  // Fälligkeit ist ein reiner Kalendertag (due_at = UTC-Mitternacht, normalizeDue).
  // Gegen den Tagesanfang vergleichen (nicht `now()`), damit eine heute fällige
  // Karte nicht ab 00:00 UTC als „überfällig" gilt — konsistent zu dueState().
  const today = sql`date_trunc('day', now())`;
  const [overdue, dueSoon, recent] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      SELECT ${CARD_REF_COLUMNS} ${base}
      WHERE c.completed_at IS NULL AND c.due_at IS NOT NULL AND c.due_at < ${today}
      ORDER BY c.due_at ASC LIMIT ${perGroup}`),
    db.execute<Record<string, unknown>>(sql`
      SELECT ${CARD_REF_COLUMNS} ${base}
      WHERE c.completed_at IS NULL AND c.due_at IS NOT NULL
        AND c.due_at >= ${today} AND c.due_at < ${today} + interval '7 days'
      ORDER BY c.due_at ASC LIMIT ${perGroup}`),
    db.execute<Record<string, unknown>>(sql`
      SELECT ${CARD_REF_COLUMNS} ${base}
      ORDER BY c.created_at DESC LIMIT ${perGroup}`),
  ]);

  return {
    overdue: [...overdue].map(cardRefFromRow),
    due_soon: [...dueSoon].map(cardRefFromRow),
    recent: [...recent].map(cardRefFromRow),
  };
}

/** ⌘K-Kartensuche über alle Boards: Titel ODER Checklisten-/Unteraufgaben-Text.
 *  Leere Query -> keine Treffer (die Palette zeigt dann nichts). */
export async function searchCards(query: string, limit = 8): Promise<BoardCardRef[]> {
  const q = query.trim();
  if (!q) return [];
  // LIKE-Sonderzeichen entschärfen, damit % / _ / \ als Literale suchen.
  const pattern = `%${q.toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT ${CARD_REF_COLUMNS}
    FROM cards c
    JOIN boards b ON b.id = c.board_id AND b.archived_at IS NULL
    JOIN board_columns col ON col.id = c.column_id
    WHERE c.archived_at IS NULL
      AND (
        lower(c.title) LIKE ${pattern} ESCAPE '\\'
        OR EXISTS (
          SELECT 1 FROM card_items i
          WHERE i.card_id = c.id AND lower(i.text) LIKE ${pattern} ESCAPE '\\'
        )
      )
    ORDER BY (c.completed_at IS NOT NULL), c.updated_at DESC
    LIMIT ${limit}`);
  return [...rows].map(cardRefFromRow);
}

/** Archiv-Ansicht eines Boards: alle archivierten Karten mit Herkunfts-Kanal,
 *  neueste zuerst (nach Archivierungszeitpunkt). */
export async function listArchivedCards(boardId: string): Promise<ArchivedCard[]> {
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT c.id, c.title, c.due_at, c.completed_at, c.archived_at,
           col.id AS column_id, col.name AS column_name, col.color AS column_color
    FROM cards c
    JOIN board_columns col ON col.id = c.column_id
    WHERE c.board_id = ${boardId} AND c.archived_at IS NOT NULL
    ORDER BY c.archived_at DESC`);
  return [...rows].map((r) => ({
    id: r.id as string,
    title: r.title as string,
    column_id: r.column_id as string,
    column_name: r.column_name as string,
    column_color: r.column_color as string,
    due_at: toIso(r.due_at),
    completed_at: toIso(r.completed_at),
    archived_at: toIso(r.archived_at) ?? new Date(0).toISOString(),
  }));
}

/** „Liegt im Board?": Karten, die aus einem bestimmten Event/einer Publikation
 *  angelegt wurden (source_event_id / source_publication_id) ODER es als
 *  Smart-Objekt referenzieren (card_references). Für die „Im Board"-Anzeige
 *  an Event-Cockpit und Publikations-Detail. */
export async function getCardsForSource(source: {
  eventId?: string;
  publicationId?: string;
}): Promise<BoardCardRef[]> {
  const { eventId, publicationId } = source;
  if (!eventId && !publicationId) return [];
  const cond = eventId
    ? sql`(c.source_event_id = ${eventId} OR EXISTS (
        SELECT 1 FROM card_references r WHERE r.card_id = c.id AND r.event_id = ${eventId}))`
    : sql`(c.source_publication_id = ${publicationId} OR EXISTS (
        SELECT 1 FROM card_references r WHERE r.card_id = c.id AND r.publication_id = ${publicationId}))`;
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT ${CARD_REF_COLUMNS}
    FROM cards c
    JOIN boards b ON b.id = c.board_id AND b.archived_at IS NULL
    JOIN board_columns col ON col.id = c.column_id
    WHERE ${cond} AND c.archived_at IS NULL
    ORDER BY c.created_at DESC`);
  return [...rows].map(cardRefFromRow);
}

/** Batch-Variante von {@link getCardsForSource} für Event-Listen: liefert je
 *  Event die neueste Board-Karte (falls vorhanden) als Map — Herkunft
 *  (source_event_id) UND Smart-Objekt-Referenzen (card_references) zählen.
 *  Ein Query statt eines Client-Wasserfalls pro Zeile — für den „Im Board ·
 *  Karte öffnen"-Deep-Link an gepitchten Events (/events Liste).
 *  `sql.param(...)::uuid[]` wegen des Drizzle-ANY(array)-Prod-Bugs über den
 *  Supabase-Pooler. */
export async function getCardsForEvents(
  eventIds: string[],
): Promise<Map<string, BoardCardRef>> {
  const out = new Map<string, BoardCardRef>();
  if (eventIds.length === 0) return out;
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT ${CARD_REF_COLUMNS}, m.event_id
    FROM (
      SELECT id AS card_id, source_event_id AS event_id FROM cards
      WHERE source_event_id = ANY(${sql.param(eventIds)}::uuid[])
      UNION
      SELECT card_id, event_id FROM card_references
      WHERE event_id = ANY(${sql.param(eventIds)}::uuid[])
    ) m
    JOIN cards c ON c.id = m.card_id
    JOIN boards b ON b.id = c.board_id AND b.archived_at IS NULL
    JOIN board_columns col ON col.id = c.column_id
    WHERE c.archived_at IS NULL
    ORDER BY c.created_at DESC`);
  // created_at DESC → erste gesehene Karte je Event ist die neueste.
  for (const r of rows) {
    const eventId = r.event_id as string | null;
    if (eventId && !out.has(eventId)) out.set(eventId, cardRefFromRow(r));
  }
  return out;
}
