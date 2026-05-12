import { sql, type AnyColumn, type SQL } from 'drizzle-orm';

/**
 * `<col> DESC NULLS LAST` order clause.
 *
 * Drizzle's `desc()` helper doesn't expose Postgres's `NULLS LAST/FIRST`
 * knob — and for our analyst views the difference matters: ~600 pubs in
 * production have NULL `published_at` (incomplete WebDB rows) and a plain
 * `desc(published_at)` puts those at the top of every DESC sort, which is
 * the wrong place. Same story for `press_score`, `decided_at`, etc.
 *
 * This helper produces the explicit clause via Drizzle's column-aware
 * `sql` template — it's not a raw-SQL bypass: `${col}` is still escaped
 * by Drizzle's identifier serializer. The only thing this helper does
 * that `desc()` cannot is add the `NULLS LAST` modifier.
 *
 * Prefer this over inline `sql\`${col} DESC NULLS LAST\`` so that a search
 * for "NULLS LAST" hits the workaround documentation rather than every
 * call site.
 */
export function descNullsLast(col: AnyColumn | SQL): SQL {
  return sql`${col} DESC NULLS LAST`;
}

export function ascNullsLast(col: AnyColumn | SQL): SQL {
  return sql`${col} ASC NULLS LAST`;
}
