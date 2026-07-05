import 'server-only';

import { and, asc, eq, sql } from 'drizzle-orm';
import { db, boards, boardColumns, userBoardFavorites } from '@/lib/server/db';
import type {
  BoardColumn,
  BoardSummary,
  BoardWithColumns,
  CardChip,
} from '@/lib/shared/board';
import { slugifyBoardName } from '@/lib/shared/board';
import { listHiddenColumnIds } from './columns';
import { BoardNotFoundError, isUniqueViolation } from './errors';
import { listBoardLabels } from './labels';
import { nextBoardRank } from './rank-util';
import {
  boardSummaryFromRow,
  cardChipFromRow,
  columnRowToApi,
} from './to-api';

/**
 * Board-Übersicht + Switcher-Datenquelle. Ein Board = eine MeisterTask-
 * Projektliste. card_count und last_activity_at werden pro Board aggregiert
 * (kein Denormalisieren, §5); is_favorite ist nutzerspezifisch.
 */
const BOARD_SELECT = (userId: string) => sql`
  SELECT b.id, b.name, b.slug, b.rank, b.archived_at,
    (SELECT count(*) FROM cards c WHERE c.board_id = b.id AND c.archived_at IS NULL)::int AS card_count,
    (SELECT max(a.created_at) FROM card_activity a
       JOIN cards c2 ON c2.id = a.card_id WHERE c2.board_id = b.id) AS last_activity_at,
    EXISTS(SELECT 1 FROM user_board_favorites f
       WHERE f.board_id = b.id AND f.user_id = ${userId}) AS is_favorite
  FROM boards b`;

export async function listBoards(userId: string): Promise<BoardSummary[]> {
  const rows = await db.execute<Record<string, unknown>>(
    sql`${BOARD_SELECT(userId)} ORDER BY b.rank`,
  );
  return [...rows].map(boardSummaryFromRow);
}

async function getBoardSummary(
  userId: string,
  slug: string,
): Promise<BoardSummary | null> {
  const rows = await db.execute<Record<string, unknown>>(
    sql`${BOARD_SELECT(userId)} WHERE b.slug = ${slug} LIMIT 1`,
  );
  return rows[0] ? boardSummaryFromRow(rows[0]) : null;
}

async function listColumns(boardId: string): Promise<BoardColumn[]> {
  const rows = await db
    .select()
    .from(boardColumns)
    .where(eq(boardColumns.boardId, boardId))
    .orderBy(asc(boardColumns.rank));
  return rows.map(columnRowToApi);
}

/**
 * Alle Karten-Chips eines Boards in einem Query: Item-Aggregate (Checkliste/
 * Unteraufgaben done/total), Kommentar-/Anhang-Zähler, Beobachter-IDs und
 * `search_text` (Titel + Item-Texte, kleingeschrieben) für den Client-Filter.
 */
async function listCardChips(boardId: string): Promise<CardChip[]> {
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT c.id, c.board_id, c.column_id, c.title, c.link_url, c.rank,
           c.due_at, c.completed_at, c.assignee_id,
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
    WHERE c.board_id = ${boardId} AND c.archived_at IS NULL
    ORDER BY c.column_id, c.rank`);
  return [...rows].map(cardChipFromRow);
}

/** Voller Board-Load für /board/[slug]. */
export async function getBoardWithColumns(
  userId: string,
  slug: string,
): Promise<BoardWithColumns> {
  const board = await getBoardSummary(userId, slug);
  if (!board) throw new BoardNotFoundError();
  const [columns, cards, labels, hiddenColumnIds] = await Promise.all([
    listColumns(board.id),
    listCardChips(board.id),
    listBoardLabels(board.id),
    listHiddenColumnIds(userId, board.id),
  ]);
  return { board, columns, cards, labels, hidden_column_ids: hiddenColumnIds };
}

// --- Writes ---------------------------------------------------------------

/** Anlegen: eindeutigen Slug finden (base, base-2, base-3…), ans Ende der
 *  Board-Ordnung hängen. */
export async function createBoard(name: string): Promise<BoardSummary> {
  const base = slugifyBoardName(name);
  const rank = await nextBoardRank();
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    try {
      const [row] = await db
        .insert(boards)
        .values({ name, slug, rank })
        .returning();
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        rank: row.rank,
        archived_at: row.archivedAt,
        card_count: 0,
        last_activity_at: null,
        is_favorite: false,
      };
    } catch (err) {
      if (isUniqueViolation(err)) continue; // Slug-Kollision -> nächster Suffix
      throw err;
    }
  }
  throw new Error('Kein freier Slug gefunden.');
}

export async function patchBoard(
  userId: string,
  boardId: string,
  patch: { name?: string; archived?: boolean },
): Promise<BoardSummary> {
  const changes: Partial<typeof boards.$inferInsert> = {};
  if (patch.name !== undefined) changes.name = patch.name;
  if (patch.archived !== undefined) {
    changes.archivedAt = patch.archived ? new Date().toISOString() : null;
  }
  const [row] = await db
    .update(boards)
    .set(changes)
    .where(eq(boards.id, boardId))
    .returning();
  if (!row) throw new BoardNotFoundError();
  const summary = await getBoardSummary(userId, row.slug);
  if (!summary) throw new BoardNotFoundError();
  return summary;
}

/** Favoriten-Stern setzen/entfernen (idempotent). */
export async function setBoardFavorite(
  userId: string,
  boardId: string,
  favorite: boolean,
): Promise<void> {
  // Existenz sicherstellen (FK würde sonst 23503 werfen -> unklarer 500).
  const [b] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(eq(boards.id, boardId))
    .limit(1);
  if (!b) throw new BoardNotFoundError();
  if (favorite) {
    await db
      .insert(userBoardFavorites)
      .values({ userId, boardId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(userBoardFavorites)
      .where(
        and(
          eq(userBoardFavorites.userId, userId),
          eq(userBoardFavorites.boardId, boardId),
        ),
      );
  }
}
