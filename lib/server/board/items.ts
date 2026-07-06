import 'server-only';

import { eq, sql } from 'drizzle-orm';
import { db, cards, cardItems, boardColumns } from '@/lib/server/db';
import type { CardDetail, CardItem } from '@/lib/shared/board';
import type {
  ItemConvertPayload,
  ItemCreatePayload,
  ItemPatchPayload,
} from '@/lib/shared/board-schemas';
import {
  CardItemNotFoundError,
  CardNotFoundError,
  ColumnNotFoundError,
  ItemAlreadyConvertedError,
} from './errors';
import { nextCardRank, nextItemRank, withRankRetry } from './rank-util';
import { cardItemFromRow } from './to-api';
import { writeActivity } from './activity';
import { getCardDetail } from './cards';

/** Ein Item als CardItem inkl. converted_card_id neu laden. */
async function loadItem(itemId: string): Promise<CardItem> {
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT i.id, i.card_id, i.kind, i.text, i.rank, i.done_at, i.done_by,
           conv.id AS converted_card_id
    FROM card_items i
    LEFT JOIN cards conv ON conv.converted_from_item_id = i.id
    WHERE i.id = ${itemId}
    LIMIT 1`);
  if (!rows[0]) throw new CardItemNotFoundError();
  return cardItemFromRow(rows[0]);
}

export async function addItem(userId: string, payload: ItemCreatePayload): Promise<CardItem> {
  const [card] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(eq(cards.id, payload.card_id))
    .limit(1);
  if (!card) throw new CardNotFoundError();

  const inserted = await withRankRetry(async () => {
    const rank = await nextItemRank(payload.card_id);
    const [row] = await db
      .insert(cardItems)
      .values({
        cardId: payload.card_id,
        kind: payload.kind,
        text: payload.text,
        rank,
      })
      .returning();
    return row;
  });
  // MeisterTask loggt auch das Anlegen von Einträgen — ohne item_added fehlte
  // im Strang, WER die Checkliste aufgebaut hat (User-Report 2026-07-06).
  await writeActivity(payload.card_id, userId, 'item_added', {
    item_id: inserted.id,
    text: payload.text,
    kind: payload.kind,
  });
  return loadItem(inserted.id);
}

/** Text ändern und/oder ab-/anhaken. Abhaken setzt done_at + done_by und logt
 *  item_checked/item_unchecked. */
export async function patchItem(
  userId: string,
  itemId: string,
  patch: ItemPatchPayload,
): Promise<CardItem> {
  const [before] = await db
    .select()
    .from(cardItems)
    .where(eq(cardItems.id, itemId))
    .limit(1);
  if (!before) throw new CardItemNotFoundError();

  const changes: Partial<typeof cardItems.$inferInsert> = {};
  if (patch.text !== undefined) changes.text = patch.text;
  if (patch.done !== undefined) {
    changes.doneAt = patch.done ? new Date().toISOString() : null;
    changes.doneBy = patch.done ? userId : null;
  }
  await db.update(cardItems).set(changes).where(eq(cardItems.id, itemId));

  if (patch.done !== undefined) {
    const wasDone = before.doneAt !== null;
    if (wasDone !== patch.done) {
      await writeActivity(
        before.cardId,
        userId,
        patch.done ? 'item_checked' : 'item_unchecked',
        { item_id: itemId, text: before.text, kind: before.kind },
      );
    }
  }
  return loadItem(itemId);
}

export async function deleteItem(itemId: string): Promise<void> {
  const res = await db
    .delete(cardItems)
    .where(eq(cardItems.id, itemId))
    .returning({ id: cardItems.id });
  if (res.length === 0) throw new CardItemNotFoundError();
}

/**
 * Unteraufgabe -> eigene Karte (Zeitreise-Workflow, §5). Neue Karte in der
 * Zielspalte, Titel = Item-Text, converted_from_item_id verlinkt zurück; Activity
 * 'created_from_subtask' auf der neuen Karte. Die Ursprungs-Unteraufgabe bleibt
 * bestehen (der Client zeigt dann „Karte öffnen").
 */
export async function convertItemToCard(
  userId: string,
  itemId: string,
  payload: ItemConvertPayload,
): Promise<CardDetail> {
  const [item] = await db
    .select()
    .from(cardItems)
    .where(eq(cardItems.id, itemId))
    .limit(1);
  if (!item) throw new CardItemNotFoundError();

  // Schon-konvertiert-Guard: verhindert zwei Karten mit demselben
  // converted_from_item_id (sonst Join-Fan-out in getCardDetail). Der partielle
  // UNIQUE-Index in der Migration ist der harte Backstop gegen die Race.
  const [existing] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(eq(cards.convertedFromItemId, itemId))
    .limit(1);
  if (existing) throw new ItemAlreadyConvertedError(existing.id);

  const [col] = await db
    .select({ boardId: boardColumns.boardId })
    .from(boardColumns)
    .where(eq(boardColumns.id, payload.column_id))
    .limit(1);
  if (!col) throw new ColumnNotFoundError();

  const due =
    payload.due_at === undefined || payload.due_at === null
      ? null
      : new Date(payload.due_at).toISOString();

  const inserted = await withRankRetry(async () => {
    const rank = await nextCardRank(payload.column_id);
    const [row] = await db
      .insert(cards)
      .values({
        boardId: col.boardId,
        columnId: payload.column_id,
        title: item.text,
        rank,
        dueAt: due,
        createdBy: userId,
        convertedFromItemId: itemId,
      })
      .returning();
    return row;
  });

  await writeActivity(inserted.id, userId, 'created_from_subtask', {
    from_item_id: itemId,
    from_card_id: item.cardId,
  });

  return getCardDetail(inserted.id);
}
