import { sql } from 'drizzle-orm';
import { db } from '@/lib/server/db';
import type { ResearcherDetail } from '@/lib/shared/researchers';

/**
 * RSC-facing wrapper around the `researcher_detail()` Postgres function.
 * The function aggregates person/stats/activity/coauthors/publications into
 * a single row to keep the round-trip count flat — see ADR 0005.
 *
 * Today's two callers are (1) the Phase-A4 RSC pilot
 * (`app/persons/[id]/page.tsx`) and (2) the `/api/persons/[id]` route.
 * The route stays as the external/legacy surface; new server-side reads
 * should call this directly per ADR 0009.
 *
 * Returns `null` when the SQL function returns an empty rowset or a row
 * with `person = null` (the function's own not-found signal).
 */
export async function getResearcherDetail(opts: {
  id: string;
  since: string;
  excludeIta?: boolean;
  excludeOutreach?: boolean;
}): Promise<ResearcherDetail | null> {
  const excludeIta = opts.excludeIta ?? true;
  const excludeOutreach = opts.excludeOutreach ?? true;
  const rows = (await db.execute(
    sql`SELECT person, stats, activity, coauthors, publications
        FROM researcher_detail(${opts.id}::uuid, ${opts.since}::date, ${excludeIta}, ${excludeOutreach})`,
  )) as unknown as ResearcherDetail[];
  const row = rows[0];
  if (!row || !row.person) return null;
  return row;
}
