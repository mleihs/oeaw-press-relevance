import 'server-only';

import { and, asc, eq, sql } from 'drizzle-orm';
import { db, boardLabels, cardLabels, cards } from '@/lib/server/db';
import type { BoardLabel } from '@/lib/shared/board';
import { BOARD_LABEL_SWATCHES } from '@/lib/shared/board';
import {
  BoardNotFoundError,
  CardNotFoundError,
  isUniqueViolation,
} from './errors';
import { nextLabelRank, withRankRetry } from './rank-util';

function labelRowToApi(row: typeof boardLabels.$inferSelect): BoardLabel {
  return {
    id: row.id,
    board_id: row.boardId,
    name: row.name,
    color: row.color,
    rank: row.rank,
  };
}

/** Label-Palette eines Boards (nach Rank), für Board-Load + Picker + Filter. */
export async function listBoardLabels(boardId: string): Promise<BoardLabel[]> {
  const rows = await db
    .select()
    .from(boardLabels)
    .where(eq(boardLabels.boardId, boardId))
    .orderBy(asc(boardLabels.rank));
  return rows.map(labelRowToApi);
}

/** Neues Label ans Ende der Palette. Farbe rotiert durch die Swatches, wenn
 *  keine gewählt wurde. */
export async function createLabel(
  boardId: string,
  name: string,
  color?: string,
): Promise<BoardLabel> {
  const [{ n: existing }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(boardLabels)
    .where(eq(boardLabels.boardId, boardId));
  const chosen = color ?? BOARD_LABEL_SWATCHES[existing % BOARD_LABEL_SWATCHES.length];

  const row = await withRankRetry(async () => {
    const rank = await nextLabelRank(boardId);
    const [inserted] = await db
      .insert(boardLabels)
      .values({ boardId, name: name.trim(), color: chosen, rank })
      .returning();
    return inserted;
  });
  return labelRowToApi(row);
}

export async function deleteLabel(labelId: string): Promise<void> {
  // card_labels cascaden per FK — die Karten verlieren nur das Label, bleiben.
  const res = await db.delete(boardLabels).where(eq(boardLabels.id, labelId)).returning({ id: boardLabels.id });
  if (res.length === 0) throw new BoardNotFoundError();
}

/** Label an eine Karte hängen. Idempotent (ON CONFLICT DO NOTHING über den
 *  zusammengesetzten PK). Wirft, wenn Karte oder Label fremd sind. */
export async function addCardLabel(cardId: string, labelId: string): Promise<void> {
  const [card] = await db.select({ id: cards.id }).from(cards).where(eq(cards.id, cardId)).limit(1);
  if (!card) throw new CardNotFoundError();
  try {
    await db
      .insert(cardLabels)
      .values({ cardId, labelId })
      .onConflictDoNothing();
  } catch (e) {
    // FK-Verletzung (Label existiert nicht) → als NotFound behandeln.
    if (isUniqueViolation(e)) return;
    throw e;
  }
}

export async function removeCardLabel(cardId: string, labelId: string): Promise<void> {
  await db
    .delete(cardLabels)
    .where(and(eq(cardLabels.cardId, cardId), eq(cardLabels.labelId, labelId)));
}
