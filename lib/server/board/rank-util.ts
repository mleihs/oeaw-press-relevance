import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import { db, boards, boardColumns, cards, cardItems, boardLabels } from '@/lib/server/db';
import { rankBetween } from '@/lib/shared/rank';
import { isUniqueViolation } from './errors';

/**
 * Fraktionale Ranks am DB-Rand. „An das Ende hängen" heißt: den größten
 * vorhandenen Rank im Geltungsbereich lesen und rankBetween(max, null) bilden.
 * Zwei parallele Appends können denselben max lesen und kollidieren dann auf
 * dem UNIQUE(scope, rank) — genau dafür ist withRankRetry da (§3.2).
 *
 * ORDER BY / MAX über rank ist bytewise korrekt, weil die Spalte COLLATE "C"
 * trägt (Migration) — passt exakt zum JS-Codeunit-Vergleich in rank.ts.
 */

export async function nextBoardRank(): Promise<string> {
  const [row] = await db
    .select({ rank: boards.rank })
    .from(boards)
    .orderBy(desc(boards.rank))
    .limit(1);
  return rankBetween(row?.rank ?? null, null);
}

export async function nextColumnRank(boardId: string): Promise<string> {
  const [row] = await db
    .select({ rank: boardColumns.rank })
    .from(boardColumns)
    .where(eq(boardColumns.boardId, boardId))
    .orderBy(desc(boardColumns.rank))
    .limit(1);
  return rankBetween(row?.rank ?? null, null);
}

export async function nextCardRank(columnId: string): Promise<string> {
  const [row] = await db
    .select({ rank: cards.rank })
    .from(cards)
    .where(eq(cards.columnId, columnId))
    .orderBy(desc(cards.rank))
    .limit(1);
  return rankBetween(row?.rank ?? null, null);
}

export async function nextItemRank(cardId: string): Promise<string> {
  const [row] = await db
    .select({ rank: cardItems.rank })
    .from(cardItems)
    .where(eq(cardItems.cardId, cardId))
    .orderBy(desc(cardItems.rank))
    .limit(1);
  return rankBetween(row?.rank ?? null, null);
}

export async function nextLabelRank(boardId: string): Promise<string> {
  const [row] = await db
    .select({ rank: boardLabels.rank })
    .from(boardLabels)
    .where(eq(boardLabels.boardId, boardId))
    .orderBy(desc(boardLabels.rank))
    .limit(1);
  return rankBetween(row?.rank ?? null, null);
}

/** Rank zwischen zwei Spalten-Nachbarn (Reorder in der Verwaltung). */
export async function columnRankBetween(
  boardId: string,
  beforeId: string | null | undefined,
  afterId: string | null | undefined,
): Promise<string> {
  const prev = beforeId ? await columnRankOf(boardId, beforeId) : null;
  const next = afterId ? await columnRankOf(boardId, afterId) : null;
  return rankBetween(prev, next);
}

async function columnRankOf(boardId: string, id: string): Promise<string | null> {
  const [row] = await db
    .select({ rank: boardColumns.rank })
    .from(boardColumns)
    .where(and(eq(boardColumns.boardId, boardId), eq(boardColumns.id, id)))
    .limit(1);
  return row?.rank ?? null;
}

/**
 * Führt `fn` aus und wiederholt bei einer Rank-UNIQUE-Kollision (23505) — bis
 * `attempts` Versuche. `fn` muss den Rank bei jedem Aufruf frisch berechnen
 * (die Reader oben tun das), sonst kollidiert der Retry erneut. Andere Fehler
 * werden sofort weitergereicht.
 */
export async function withRankRetry<T>(
  fn: () => Promise<T>,
  attempts = 5,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}
