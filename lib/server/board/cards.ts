import 'server-only';

import { asc, eq, sql } from 'drizzle-orm';
import { db, cards, cardItems, cardActivity, cardAttachments, boardColumns } from '@/lib/server/db';
import { rankBetween } from '@/lib/shared/rank';
import { deleteObjects } from '@/lib/server/storage/s3';
import type { CardChip, CardDetail } from '@/lib/shared/board';
import type { CardCreatePayload, CardPatchPayload } from '@/lib/shared/board-schemas';
import { CardNotFoundError, ColumnNotFoundError } from './errors';
import { nextCardRank, withRankRetry } from './rank-util';
import {
  activityRowToApi,
  cardChipFromRow,
  cardItemFromRow,
  toIso,
} from './to-api';
import { writeActivity } from './activity';
import { renderCardMarkdown } from './markdown';
import { loadComments } from './comments';
import { loadAttachments } from './attachments';

/** ISO/Datums-String -> timestamptz-tauglicher ISO oder null. */
function normalizeDue(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(value).toISOString();
}

/** Zeile mit Chip-Aggregaten + Karten-Metadaten für eine einzelne Karte. */
const CARD_DETAIL_ROW = (cardId: string) => sql<Record<string, unknown>>`
  SELECT c.id, c.board_id, c.column_id, c.title, c.link_url, c.rank,
         c.due_at, c.completed_at, c.archived_at, c.assignee_id, c.description_md,
         c.created_by, c.created_at, c.updated_at, c.converted_from_item_id,
         c.source_event_id, c.source_publication_id,
         COALESCE(ci.checklist_done, 0) AS checklist_done,
         COALESCE(ci.checklist_total, 0) AS checklist_total,
         COALESCE(ci.subtask_done, 0) AS subtask_done,
         COALESCE(ci.subtask_total, 0) AS subtask_total,
         COALESCE(cm.n, 0) AS comment_count,
         COALESCE(at.n, 0) AS attachment_count,
         COALESCE(w.ids, ARRAY[]::text[]) AS watcher_ids,
         COALESCE(lb.ids, ARRAY[]::text[]) AS label_ids,
         lower(c.title || ' ' || COALESCE(ci.texts, '')) AS search_text
  FROM cards c
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE kind = 'checklist')::int AS checklist_total,
      count(*) FILTER (WHERE kind = 'checklist' AND done_at IS NOT NULL)::int AS checklist_done,
      count(*) FILTER (WHERE kind = 'subtask')::int AS subtask_total,
      count(*) FILTER (WHERE kind = 'subtask' AND done_at IS NOT NULL)::int AS subtask_done,
      string_agg(text, ' ') AS texts
    FROM card_items WHERE card_id = c.id
  ) ci ON true
  LEFT JOIN LATERAL (SELECT count(*)::int AS n FROM card_comments WHERE card_id = c.id) cm ON true
  LEFT JOIN LATERAL (SELECT count(*)::int AS n FROM card_attachments WHERE card_id = c.id) at ON true
  LEFT JOIN LATERAL (SELECT array_agg(user_id::text) AS ids FROM card_watchers WHERE card_id = c.id) w ON true
  LEFT JOIN LATERAL (
    SELECT array_agg(cl.label_id::text ORDER BY bl.rank) AS ids
    FROM card_labels cl JOIN board_labels bl ON bl.id = cl.label_id
    WHERE cl.card_id = c.id
  ) lb ON true
  WHERE c.id = ${cardId}
  LIMIT 1`;

async function loadChipRow(cardId: string): Promise<Record<string, unknown>> {
  const rows = await db.execute<Record<string, unknown>>(CARD_DETAIL_ROW(cardId));
  if (!rows[0]) throw new CardNotFoundError();
  return rows[0];
}

async function loadItems(cardId: string) {
  // converted_card_id: die Karte, die aus dieser Unteraufgabe entstand
  // (Rück-Lookup über cards.converted_from_item_id).
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT i.id, i.card_id, i.kind, i.text, i.rank, i.done_at, i.done_by,
           conv.id AS converted_card_id
    FROM card_items i
    LEFT JOIN cards conv ON conv.converted_from_item_id = i.id
    WHERE i.card_id = ${cardId}
    ORDER BY i.kind, i.rank`);
  return [...rows].map(cardItemFromRow);
}

async function loadActivity(cardId: string) {
  const rows = await db
    .select()
    .from(cardActivity)
    .where(eq(cardActivity.cardId, cardId))
    .orderBy(asc(cardActivity.id));
  return rows.map((r) =>
    activityRowToApi({
      id: r.id,
      card_id: r.cardId,
      actor_id: r.actorId,
      verb: r.verb,
      payload: r.payload,
      created_at: r.createdAt,
    }),
  );
}

export async function getCardDetail(cardId: string): Promise<CardDetail> {
  const [row, items, comments, attachments, activity] = await Promise.all([
    loadChipRow(cardId),
    loadItems(cardId),
    loadComments(cardId),
    loadAttachments(cardId),
    loadActivity(cardId),
  ]);
  const descriptionMd = (row.description_md as string | null) ?? null;
  return {
    ...cardChipFromRow(row),
    archived_at: toIso(row.archived_at),
    description_md: descriptionMd,
    description_html: descriptionMd ? renderCardMarkdown(descriptionMd) : null,
    created_by: row.created_by as string,
    created_at: new Date(row.created_at as string).toISOString(),
    updated_at: new Date(row.updated_at as string).toISOString(),
    converted_from_item_id: (row.converted_from_item_id as string | null) ?? null,
    source_event_id: (row.source_event_id as string | null) ?? null,
    source_publication_id: (row.source_publication_id as string | null) ?? null,
    items,
    comments,
    attachments,
    activity,
  };
}

/** Quick-Create (Titel + Zielspalte) UND Triage-Create (Phase 4): optional mit
 *  vorbefüllter Beschreibung, Quelle (Event/Publikation) und initialer
 *  Checkliste. Board aus der Spalte abgeleitet, Rank ans Spaltenende. Activity
 *  'created_from_triage' wenn eine Quelle gesetzt ist, sonst 'created'. */
export async function createCard(
  userId: string,
  payload: CardCreatePayload,
): Promise<CardChip> {
  const [col] = await db
    .select({ boardId: boardColumns.boardId })
    .from(boardColumns)
    .where(eq(boardColumns.id, payload.column_id))
    .limit(1);
  if (!col) throw new ColumnNotFoundError();

  const inserted = await withRankRetry(async () => {
    const rank = await nextCardRank(payload.column_id);
    const [row] = await db
      .insert(cards)
      .values({
        boardId: col.boardId,
        columnId: payload.column_id,
        title: payload.title,
        linkUrl: payload.link_url ?? null,
        dueAt: normalizeDue(payload.due_at) ?? null,
        descriptionMd: payload.description_md ?? null,
        sourceEventId: payload.source_event_id ?? null,
        sourcePublicationId: payload.source_publication_id ?? null,
        rank,
        createdBy: userId,
      })
      .returning();
    return row;
  });

  // Initiale Checkliste (Triage-Template) in EINEM Insert. Die Karte ist frisch,
  // ihre Item-Ranks haben keine Konkurrenz -> sequenziell rankBetween ohne Retry.
  const initialItems = payload.items ?? [];
  if (initialItems.length > 0) {
    let prev: string | null = null;
    const rows = initialItems.map((it) => {
      const rank = rankBetween(prev, null);
      prev = rank;
      return { cardId: inserted.id, kind: it.kind, text: it.text, rank };
    });
    await db.insert(cardItems).values(rows);
  }

  const fromTriage = payload.source_event_id != null || payload.source_publication_id != null;
  await writeActivity(inserted.id, userId, fromTriage ? 'created_from_triage' : 'created');
  const chipRow = await loadChipRow(inserted.id);
  return cardChipFromRow(chipRow);
}

/** Feld-Updates + Statuswechsel. Logt due/assignee/completed-Transitionen
 *  (Titel/Beschreibung/Link sind reine Edits, kein Aktivitätseintrag). */
export async function patchCard(
  userId: string,
  cardId: string,
  patch: CardPatchPayload,
): Promise<CardDetail> {
  const [before] = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
  if (!before) throw new CardNotFoundError();

  const changes: Partial<typeof cards.$inferInsert> = {};
  if (patch.title !== undefined) changes.title = patch.title;
  if (patch.description_md !== undefined) changes.descriptionMd = patch.description_md;
  if (patch.link_url !== undefined) changes.linkUrl = patch.link_url;
  if (patch.due_at !== undefined) changes.dueAt = normalizeDue(patch.due_at) ?? null;
  if (patch.assignee_id !== undefined) changes.assigneeId = patch.assignee_id;
  if (patch.completed !== undefined) {
    changes.completedAt = patch.completed ? new Date().toISOString() : null;
  }
  if (patch.archived !== undefined) {
    changes.archivedAt = patch.archived ? new Date().toISOString() : null;
  }

  await db.update(cards).set(changes).where(eq(cards.id, cardId));

  // Aktivität nach Transition (nur wenn sich der relevante Zustand ändert).
  // before.dueAt kommt als Postgres-Textformat ("2026-07-08 00:00:00+00"),
  // `to` als ISO — vor dem Vergleich auf ISO normalisieren, sonst wäre der
  // Guard bei zwei non-null-Werten immer true und würde bei jedem PATCH einen
  // spuriösen (unlöschbaren) due_set-Eintrag ins append-only Log schreiben.
  if (patch.due_at !== undefined) {
    const to = normalizeDue(patch.due_at) ?? null;
    const from = before.dueAt ? new Date(before.dueAt).toISOString() : null;
    if (from !== to) {
      await writeActivity(cardId, userId, to ? 'due_set' : 'due_cleared', {
        due_at: to,
      });
    }
  }
  if (patch.assignee_id !== undefined && (before.assigneeId ?? null) !== patch.assignee_id) {
    await writeActivity(
      cardId,
      userId,
      patch.assignee_id ? 'assignee_set' : 'assignee_cleared',
      { assignee_id: patch.assignee_id ?? null },
    );
  }
  if (patch.completed !== undefined) {
    const wasCompleted = before.completedAt !== null;
    if (wasCompleted !== patch.completed) {
      await writeActivity(cardId, userId, patch.completed ? 'completed' : 'reopened');
    }
  }
  if (patch.archived !== undefined) {
    const wasArchived = before.archivedAt !== null;
    if (wasArchived !== patch.archived) {
      await writeActivity(cardId, userId, patch.archived ? 'archived' : 'unarchived');
    }
  }

  return getCardDetail(cardId);
}

/**
 * Alle ERLEDIGTEN (completed_at gesetzt), noch nicht archivierten Karten einer
 * Spalte in einem Rutsch archivieren (Spalten-Aktion „Abgeschlossene
 * archivieren"). Je archivierter Karte ein Activity-Eintrag. Gibt die Anzahl
 * zurück (für den Toast).
 */
export async function archiveCompletedInColumn(
  userId: string,
  columnId: string,
): Promise<number> {
  const archivedIds = await db.execute<{ id: string }>(sql`
    UPDATE cards SET archived_at = now()
    WHERE column_id = ${columnId}
      AND completed_at IS NOT NULL
      AND archived_at IS NULL
    RETURNING id`);
  const ids = [...archivedIds].map((r) => r.id);
  for (const id of ids) {
    await writeActivity(id, userId, 'archived');
  }
  return ids.length;
}

/** Move = Kanal-/Board-Wechsel. Zielspalte impliziert Zielboard; Karte ans Ende
 *  der Zielspalte. Bei Rank-Kollision retry (§3.2). Same-column = no-op. */
export async function moveCard(
  userId: string,
  cardId: string,
  toColumnId: string,
): Promise<CardDetail> {
  const [before] = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
  if (!before) throw new CardNotFoundError();
  if (before.columnId === toColumnId) return getCardDetail(cardId);

  const [target] = await db
    .select({ boardId: boardColumns.boardId })
    .from(boardColumns)
    .where(eq(boardColumns.id, toColumnId))
    .limit(1);
  if (!target) throw new ColumnNotFoundError();

  await withRankRetry(async () => {
    const rank = await nextCardRank(toColumnId);
    await db
      .update(cards)
      .set({ columnId: toColumnId, boardId: target.boardId, rank })
      .where(eq(cards.id, cardId));
  });

  await writeActivity(cardId, userId, 'moved', {
    from_column_id: before.columnId,
    to_column_id: toColumnId,
    from_board_id: before.boardId,
    to_board_id: target.boardId,
  });

  return getCardDetail(cardId);
}

/** Karte löschen (Cascade räumt Items/Watcher/Kommentare/Anhänge/Activity —
 *  der append-only Trigger lässt den Cascade-Delete zu, §Migration).
 *  Die S3-Objekte der Anhänge räumt der Cascade NICHT — vorher einsammeln
 *  und best-effort löschen, sonst verwaisen die Blobs in MinIO. */
export async function deleteCard(cardId: string): Promise<void> {
  const atts = await db
    .select({ s3Key: cardAttachments.s3Key })
    .from(cardAttachments)
    .where(eq(cardAttachments.cardId, cardId));
  const res = await db.delete(cards).where(eq(cards.id, cardId)).returning({ id: cards.id });
  if (res.length === 0) throw new CardNotFoundError();
  if (atts.length > 0) await deleteObjects(atts.map((a) => a.s3Key)).catch(() => {});
}
