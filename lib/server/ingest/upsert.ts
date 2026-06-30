// Drizzle batched upsert + maintenance helpers (ADR 0017).
//
// Replaces the hand-rolled raw-SQL `upsert(table, rows, conflictKey,
// updateCols)` from scripts/lib/db.mjs (pg.Client, string-built INSERT).
// Same observable behaviour — batched `INSERT ... ON CONFLICT (key) DO
// UPDATE SET col = EXCLUDED.col` (or `DO NOTHING` when no update columns) —
// expressed through the project's Drizzle client.

import { getTableColumns, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { PgColumn, PgTable, PgUpdateSetSource }
  from 'drizzle-orm/pg-core';
import type { db as appDb } from '@/lib/server/db';

/** The injected Drizzle client. The script entry point builds a
 *  script-scoped one from `PG_DATABASE_URL` (local-only guard); tests can
 *  pass any structurally-compatible client. */
export type IngestDb = typeof appDb;

/** Faithful port of the .mjs `BATCH` (env `BATCH_SIZE`, default 1000). */
export const BATCH = Number(process.env.BATCH_SIZE || 1000);

type Row = Record<string, unknown>;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Builds the `ON CONFLICT DO UPDATE SET` map for {@link upsertBatch}: each
 * Drizzle update key → `excluded.<resolved-db-column-name>`. Returns `null`
 * when `updateKeys` is empty (the caller then emits `DO NOTHING`).
 *
 * Pure: resolves the column name from the table's own schema and touches no DB.
 * The `EXCLUDED.<col>` reference uses the *resolved DB column name* (so a
 * camelCase JS key maps to its snake_case column), quoted via `sql.identifier`
 * — column names come from our schema, never input. Throws on an update key
 * that is not a column.
 */
export function buildUpsertSet<T extends PgTable>(
  table: T,
  updateKeys: readonly string[],
): Record<string, SQL> | null {
  if (updateKeys.length === 0) return null;
  const cols = getTableColumns(table) as Record<string, { name: string }>;
  return Object.fromEntries(
    updateKeys.map((k) => {
      const col = cols[k];
      if (!col) {
        throw new Error(`upsertBatch: unknown update column "${k}" on table`);
      }
      return [k, sql`excluded.${sql.identifier(col.name)}`];
    }),
  );
}

/**
 * Bulk insert `rows` into `table` with `ON CONFLICT (<target>) DO UPDATE SET
 * <updateKeys> = EXCLUDED.<col>`; `DO NOTHING` if `updateKeys` is empty.
 *
 * `target` / `updateKeys` are Drizzle property keys of `table`. The
 * `EXCLUDED.<col>` reference uses the resolved DB column name, quoted via
 * `sql.identifier` (column names come from our own schema, never input).
 *
 * @returns number of rows submitted (parity with the .mjs `copied` counter).
 */
export async function upsertBatch<T extends PgTable>(
  db: IngestDb,
  table: T,
  rows: Row[],
  target: keyof T['_']['columns'] | (keyof T['_']['columns'])[],
  updateKeys: readonly string[],
): Promise<number> {
  if (rows.length === 0) return 0;

  const targetKeys = (Array.isArray(target) ? target : [target]) as string[];
  const tableCols = table as unknown as Record<string, PgColumn>;
  const targetCols: PgColumn[] = targetKeys.map((k) => tableCols[k]);

  const set = buildUpsertSet(table, updateKeys);

  let submitted = 0;
  for (const slice of chunk(rows, BATCH)) {
    const base = db.insert(table).values(slice as T['$inferInsert'][]);
    if (set === null) {
      await base.onConflictDoNothing({ target: targetCols });
    } else {
      await base.onConflictDoUpdate({
        target: targetCols,
        set: set as unknown as PgUpdateSetSource<T>,
      });
    }
    submitted += slice.length;
  }
  return submitted;
}

/**
 * Run a set-based maintenance statement (UPDATE / archival / FK 2nd pass /
 * is_ita refresh) and return the affected row count, wrapping it in a
 * `WITH ... RETURNING` CTE so the count is exact through Drizzle — the
 * informative counters the .mjs script logged (`rowCount`) are preserved.
 *
 * `mutation` must be an UPDATE/DELETE/INSERT with a `RETURNING 1` clause.
 */
export async function execCountingUpdate(
  db: IngestDb,
  mutation: ReturnType<typeof sql>,
): Promise<number> {
  const res = await db.execute<{ n: number }>(
    sql`WITH _m AS (${mutation}) SELECT count(*)::int AS n FROM _m`,
  );
  // postgres-js returns an array-like RowList.
  const rows = res as unknown as Array<{ n: number }>;
  return rows[0]?.n ?? 0;
}

/** Scalar `SELECT <expr> AS v` helper for the post-import SQL functions. */
export async function execScalar<V>(
  db: IngestDb,
  query: ReturnType<typeof sql>,
): Promise<V> {
  const res = await db.execute<{ v: V }>(sql`SELECT ${query} AS v`);
  const rows = res as unknown as Array<{ v: V }>;
  return rows[0]?.v as V;
}
