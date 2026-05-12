/**
 * Smoke test for `lib/server/researchers/detail.ts` — the thin SQL-function
 * wrapper the Phase-A4 RSC pilot (`app/persons/[id]/page.tsx`) and the
 * `/api/persons/[id]` route share.
 *
 * Read-only. Exercises the three branches the wrapper has:
 *   1. valid id  → row with non-null `person`
 *   2. unknown id → row with `person = null` → wrapper returns null
 *   3. bogus uuid (well-formed but not in DB) → null
 *
 * The wire-shape contract (`ResearcherDetail` keys) is also asserted so
 * that a future signature change on the `researcher_detail()` PG function
 * surfaces here before the page breaks.
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54422/postgres' \
 *     npx tsx scripts/smoke/rsc/persons-detail.ts
 */

import { sql } from 'drizzle-orm';
import { getResearcherDetail } from '../../../lib/server/researchers/detail';
import { db } from '../../../lib/server/db';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

async function pickRealPersonId(): Promise<string> {
  const rows = (await db.execute(
    sql`SELECT id FROM persons LIMIT 1`,
  )) as unknown as Array<{ id: string }>;
  assert(rows[0]?.id, 'no persons in DB — smoke needs a populated local DB');
  return rows[0].id;
}

async function main() {
  const since = '2025-05-12';
  const realId = await pickRealPersonId();

  // 1. valid id → populated detail
  const ok = await getResearcherDetail({ id: realId, since });
  assert(ok !== null, `expected ResearcherDetail for ${realId}, got null`);
  assert(ok.person, 'ok.person must be present');
  assert(ok.person.id === realId, 'ok.person.id mismatch');
  // wire-shape spot-check — every key the page reads must survive a
  // PG-function signature drift.
  for (const k of ['stats', 'activity', 'coauthors', 'publications'] as const) {
    assert(k in ok, `key ${k} missing in ResearcherDetail`);
  }
  console.log(`  ok: real id → person ${ok.person.firstname} ${ok.person.lastname}`);

  // 2. valid uuid shape but absent from persons → row.person = null → null
  const absent = '00000000-0000-0000-0000-000000000000';
  const miss = await getResearcherDetail({ id: absent, since });
  assert(miss === null, `expected null for unknown UUID, got ${typeof miss}`);
  console.log('  ok: unknown id → null');

  // 3. explicit excludeIta=false / excludeOutreach=false flags pass through
  //    without changing the row shape (smoke only — substance of the flags
  //    is tested by the SQL-function migration tests).
  const withIta = await getResearcherDetail({
    id: realId,
    since,
    excludeIta: false,
    excludeOutreach: false,
  });
  assert(withIta !== null, 'flags-off path returned null unexpectedly');
  console.log('  ok: excludeIta=false, excludeOutreach=false honoured');

  console.log('PASS — getResearcherDetail smoke');
  process.exit(0);
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
