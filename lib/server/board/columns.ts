import 'server-only';

import { and, eq, sql } from 'drizzle-orm';
import { db, boardColumns, cards, userHiddenColumns } from '@/lib/server/db';
import type { BoardColumn } from '@/lib/shared/board';
import { BOARD_COLUMN_SWATCHES } from '@/lib/shared/board';
import { initialRanks } from '@/lib/shared/rank';
import type { ColumnPatchPayload, ColumnSortKey } from '@/lib/shared/board-schemas';
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
 * Alle Karten einer Spalte einmalig neu anordnen (kein persistenter
 * Sortiermodus): nach Fälligkeit, alphabetisch oder Erstelldatum. Danach
 * behalten die Karten ihre neue manuelle Reihenfolge (frische fraktionale
 * Ranks in Sortierreihenfolge).
 *
 * Die Sortierung passiert in SQL, damit sie exakt der `ORDER BY rank`-Ordnung
 * des Boards entspricht (Spalte COLLATE "C"; keine JS-Datumsparsing-Fallen):
 *   - due:     due_at ASC, NULLs ans Ende, dann created_at/id als stabiler Tiebreak
 *   - title:   lower(title) ASC
 *   - created: created_at ASC
 *
 * GOTCHA `unique(column_id, rank)` (nicht deferrable): Bulk-Neuvergabe kann mit
 * noch nicht aktualisierten Bestandsrängen kollidieren. Zwei-Phasen in EINER
 * Transaktion — erst auf Temp-Ränge, die BEWEISBAR über `max(bestehende ∪
 * finale)` liegen (also disjunkt zu beiden), dann auf die finalen Ränge. Weil
 * die Temp-Ränge zu allen Bestands- UND Zielrängen disjunkt sind und die
 * finalen Ränge untereinander eindeutig, kollidiert kein Zwischenzustand —
 * unabhängig von der Update-Reihenfolge innerhalb eines Statements.
 */
export async function sortColumnCards(columnId: string, by: ColumnSortKey): Promise<void> {
  await loadColumn(columnId); // 404 wenn nicht vorhanden

  const orderBy =
    by === 'due'
      ? sql`c.due_at ASC NULLS LAST, c.created_at ASC, c.id ASC`
      : by === 'title'
        ? sql`lower(c.title) ASC, c.created_at ASC, c.id ASC`
        : sql`c.created_at ASC, c.id ASC`;

  // NUR aktive Karten neu ranken — archivierte liegen außerhalb der
  // Board-Ordnung und dürfen keine sichtbaren Ranks bekommen.
  const rows = await db.execute<{ id: string; rank: string }>(sql`
    SELECT id, rank FROM cards c
    WHERE c.column_id = ${columnId} AND c.archived_at IS NULL
    ORDER BY ${orderBy}`);
  const list = [...rows];
  if (list.length <= 1) return; // 0/1 Karten: nichts umzuordnen

  const ids = list.map((r) => r.id);
  const current = list.map((r) => r.rank);
  const finals = initialRanks(list.length);
  // Temp-Namespace über allem Bestehenden: maxRank ist echtes Präfix jedes
  // Temp-Rangs ⇒ temp > maxRank ≥ jeder Bestands-/Zielrang (bytewise), also
  // disjunkt zu beiden. Temp-Seeds sind eindeutig ⇒ Temps untereinander eindeutig.
  const maxRank = [...current, ...finals].reduce((m, r) => (r > m ? r : m), '');
  const temps = initialRanks(list.length).map((seed) => maxRank + seed);

  const bulk = (pairs: { id: string; rank: string }[]) => sql`
    UPDATE cards AS c SET rank = v.rank
    FROM (VALUES ${sql.join(
      pairs.map((p) => sql`(${p.id}::uuid, ${p.rank}::text)`),
      sql`, `,
    )}) AS v(id, rank)
    WHERE c.id = v.id`;

  await db.transaction(async (tx) => {
    await tx.execute(bulk(ids.map((id, i) => ({ id, rank: temps[i] }))));
    await tx.execute(bulk(ids.map((id, i) => ({ id, rank: finals[i] }))));
  });
}

// --- Per-User-Sichtbarkeit („Für mich ausblenden") ------------------------

/** Kanal für den aktuellen Nutzer ausblenden (idempotent). */
export async function hideColumn(userId: string, columnId: string): Promise<void> {
  await loadColumn(columnId); // 404 wenn Kanal nicht existiert
  await db
    .insert(userHiddenColumns)
    .values({ userId, columnId })
    .onConflictDoNothing();
}

/** Kanal für den aktuellen Nutzer wieder einblenden (idempotent). */
export async function unhideColumn(userId: string, columnId: string): Promise<void> {
  await db
    .delete(userHiddenColumns)
    .where(
      and(
        eq(userHiddenColumns.userId, userId),
        eq(userHiddenColumns.columnId, columnId),
      ),
    );
}

/** IDs der Kanäle EINES Boards, die der Nutzer für sich ausgeblendet hat. */
export async function listHiddenColumnIds(
  userId: string,
  boardId: string,
): Promise<string[]> {
  const rows = await db
    .select({ columnId: userHiddenColumns.columnId })
    .from(userHiddenColumns)
    .innerJoin(boardColumns, eq(boardColumns.id, userHiddenColumns.columnId))
    .where(
      and(eq(userHiddenColumns.userId, userId), eq(boardColumns.boardId, boardId)),
    );
  return rows.map((r) => r.columnId);
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
