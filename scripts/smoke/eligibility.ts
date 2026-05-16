/**
 * Smoke test for the canonical press-eligibility Postgres objects
 * (migration 20260516000002) and their parity with the TS client mirror.
 *
 * Why a smoke and not a Vitest: this asserts a property of the live DB
 * schema (the views resolve to the expected rows), which is exactly the
 * DB-coupled half of the project's test split — pure logic → Vitest,
 * SQL semantics → smoke.
 *
 * Pins:
 *   1. ineligible_publication_types (PG, canonical) resolves to exactly the
 *      publication_types whose webdb_uid ∈ ELIGIBILITY_EXCLUDE_TYPE_UIDS
 *      (lib/shared/eligibility.ts, the unavoidable browser-filter mirror).
 *      A drift on either side fails here instead of silently in prod.
 *   2. press_eligible_publications actually enforces all five clauses
 *      (not archived / analyzed / not ITA / not pop-science / eligible
 *      type) — a sanity check that the canonical relation is what every
 *      consumer assumes it is.
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54422/postgres' \
 *     npx tsx scripts/smoke/eligibility.ts
 */

import { sql } from 'drizzle-orm';
import { db } from '../../lib/server/db';
import { ELIGIBILITY_EXCLUDE_TYPE_UIDS } from '../../lib/shared/eligibility';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

async function main() {
  // 1. PG canonical ↔ TS client mirror parity.
  const uidRows = await db.execute<{ uids: number[] | null }>(
    sql`SELECT array_agg(webdb_uid ORDER BY webdb_uid) AS uids
        FROM ineligible_publication_types`,
  );
  const pgUids = (uidRows[0]?.uids ?? []).slice().sort((a, b) => a - b);
  const tsUids = [...ELIGIBILITY_EXCLUDE_TYPE_UIDS].sort((a, b) => a - b);
  assert(
    JSON.stringify(pgUids) === JSON.stringify(tsUids),
    `ineligible_publication_types webdb_uids ${JSON.stringify(pgUids)} !== `
      + `ELIGIBILITY_EXCLUDE_TYPE_UIDS ${JSON.stringify(tsUids)} `
      + `(PG canonical drifted from the TS client mirror)`,
  );
  console.log(`  ok: eligibility UID parity PG↔TS ${JSON.stringify(pgUids)}`);

  // 2. The canonical eligibility relation enforces every clause. Each
  //    counter must be 0 — a non-zero means a leak in the view predicate.
  // `count(*)::int` — postgres.js returns a raw bigint as a JS string, so
  // an un-cast count would fail the strict `=== 0` check even at zero.
  // Same pattern as getSimilarityDistribution in lib/server/dashboard.
  const leakRows = await db.execute<{
    archived_leak: number;
    not_analyzed_leak: number;
    ita_leak: number;
    popsci_leak: number;
    ineligible_type_leak: number;
  }>(sql`
    SELECT
      count(*) FILTER (WHERE archived <> false)::int                       AS archived_leak,
      count(*) FILTER (WHERE analysis_status IS DISTINCT FROM 'analyzed')::int AS not_analyzed_leak,
      count(*) FILTER (WHERE is_ita_subtree <> false)::int                 AS ita_leak,
      count(*) FILTER (WHERE popular_science <> false)::int                AS popsci_leak,
      count(*) FILTER (
        WHERE publication_type_id IN (SELECT id FROM ineligible_publication_types)
      )::int                                                               AS ineligible_type_leak
    FROM press_eligible_publications
  `);
  const leak = leakRows[0]!;
  assert(leak.archived_leak === 0, `press_eligible has archived rows: ${leak.archived_leak}`);
  assert(
    leak.not_analyzed_leak === 0,
    `press_eligible has non-analyzed rows: ${leak.not_analyzed_leak}`,
  );
  assert(leak.ita_leak === 0, `press_eligible has ITA-subtree rows: ${leak.ita_leak}`);
  assert(leak.popsci_leak === 0, `press_eligible has pop-science rows: ${leak.popsci_leak}`);
  assert(
    leak.ineligible_type_leak === 0,
    `press_eligible has ineligible-type rows: ${leak.ineligible_type_leak}`,
  );
  console.log('  ok: press_eligible_publications enforces all five clauses');

  console.log('PASS — eligibility canonical smoke');
  process.exit(0);
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
