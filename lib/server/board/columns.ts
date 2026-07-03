import 'server-only';

import { eq, sql } from 'drizzle-orm';
import { db, boardColumns, cards } from '@/lib/server/db';
import type { BoardColumn } from '@/lib/shared/board';
import { BOARD_COLUMN_SWATCHES } from '@/lib/shared/board';
import type { ColumnPatchPayload } from '@/lib/shared/board-schemas';
import {
  BoardConflictError,
  ColumnNotEmptyError,
  ColumnNotFoundError,
  isUniqueViolation,
} from './errors';
import { columnRankBetween, nextColumnRank, withRankRetry } from './rank-util';
import { columnRowToApi } from './to-api';

async function loadColumn(columnId: string): Promise<typeof boardColumns.$inferSelect> {
  const [row] = await db
    .select()
    .from(boardColumns)
    .where(eq(boardColumns.id, columnId))
    .limit(1);
  if (!row) throw new ColumnNotFoundError();
  return row;
}

export async function createColumn(
  boardId: string,
  name: string,
  color?: string,
): Promise<BoardColumn> {
  const [{ n: existing }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(boardColumns)
    .where(eq(boardColumns.boardId, boardId));
  const chosen =
    color ?? BOARD_COLUMN_SWATCHES[existing % BOARD_COLUMN_SWATCHES.length];

  const row = await withRankRetry(async () => {
    const rank = await nextColumnRank(boardId);
    const [inserted] = await db
      .insert(boardColumns)
      .values({ boardId, name, color: chosen, rank })
      .returning();
    return inserted;
  });
  return columnRowToApi(row);
}

export async function patchColumn(
  columnId: string,
  patch: ColumnPatchPayload,
): Promise<BoardColumn> {
  const col = await loadColumn(columnId);

  const setName = patch.name !== undefined || patch.color !== undefined;
  const reordering = patch.before_id !== undefined || patch.after_id !== undefined;

  // Reorder braucht evtl. einen Retry (Rank-Kollision), Name/Farbe nicht — daher
  // getrennt behandeln, aber am Ende die frische Zeile zurückgeben.
  if (setName) {
    const changes: Partial<typeof boardColumns.$inferInsert> = {};
    if (patch.name !== undefined) changes.name = patch.name;
    if (patch.color !== undefined) changes.color = patch.color;
    await db.update(boardColumns).set(changes).where(eq(boardColumns.id, columnId));
  }

  if (reordering) {
    // Nebenläufiges Reorder derselben Lücke lässt sich mit fixen Ankern nicht
    // auflösen (die Anker-Ranks ändern sich zwischen den Versuchen nicht) und
    // umgestellte Anker können rankBetween einen RangeError werfen lassen —
    // beides sauber auf 409 mappen statt als 500 durchzuschlagen.
    try {
      await withRankRetry(async () => {
        const rank = await columnRankBetween(col.boardId, patch.before_id, patch.after_id);
        await db.update(boardColumns).set({ rank }).where(eq(boardColumns.id, columnId));
      });
    } catch (err) {
      if (err instanceof RangeError || isUniqueViolation(err)) {
        throw new BoardConflictError();
      }
      throw err;
    }
  }

  const [fresh] = await db
    .select()
    .from(boardColumns)
    .where(eq(boardColumns.id, columnId))
    .limit(1);
  if (!fresh) throw new ColumnNotFoundError();
  return columnRowToApi(fresh);
}

/**
 * Spalte löschen — nur wenn leer. Das „Spalte enthält Karten"-Warnmodal ist die
 * UI dazu; hier der harte Guard (die DB-RESTRICT-FK ist die dritte Sicherung).
 */
export async function deleteColumn(columnId: string): Promise<void> {
  await loadColumn(columnId); // 404 wenn nicht vorhanden
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(cards)
    .where(eq(cards.columnId, columnId));
  if (n > 0) throw new ColumnNotEmptyError(n);
  await db.delete(boardColumns).where(eq(boardColumns.id, columnId));
}
