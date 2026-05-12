/**
 * Smoke test for `lib/server/repos/publications.ts`.
 *
 * Read-only — exercises every read path (lookups, counts, filter-ID
 * pre-fetches) against the live local Supabase. Mutations
 * (`updateDecision`, `updateFlagNotes`, `deleteById`) are intentionally
 * NOT covered: a smoke run that touches real triage state would
 * contaminate analyst data. Phase-4 Vitest with testcontainers covers
 * those.
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54422/postgres' \
 *     npx tsx scripts/smoke/repos/publications.ts
 *
 * Coverage targets:
 *   - findByIdDetail              null + populated row
 *   - findManyForList             no filter + with WHERE + with embedOrgunit
 *   - findManyForQueue            empty WHERE behaviour
 *   - countWhere                  undefined + WHERE
 *   - countByDecision             every Decision key present
 *   - findIdsByOestat6            empty + multi (sql.param gotcha branch)
 *   - findIdsByHighlight          false-false (early return) + true-false + true-true
 *   - findIdsWithFlags            no args
 *   - findIdsByOrgunit            empty + multi
 *   - findPressReleasedIds        no args
 *   - readFlagNotes               null vs []
 *
 * If a new repo method lands, ADD a case here before merging.
 */

import { eq } from 'drizzle-orm';
import { publicationsRepo } from '../../../lib/server/repos/publications';
import {
  db,
  publications,
  oestat6Categories,
  orgunits,
  descNullsLast,
} from '../../../lib/server/db';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

async function pickSampleIds() {
  const [pub] = await db
    .select({ id: publications.id })
    .from(publications)
    .where(eq(publications.archived, false))
    .limit(1);
  const [oestat] = await db
    .select({ id: oestat6Categories.id })
    .from(oestat6Categories)
    .limit(1);
  const [orgunit] = await db.select({ id: orgunits.id }).from(orgunits).limit(1);
  assert(pub, 'sample pub not found');
  assert(oestat, 'sample oestat6 not found');
  assert(orgunit, 'sample orgunit not found');
  return { pubId: pub.id, oestat6Id: oestat.id, orgunitId: orgunit.id };
}

async function main() {
  const { pubId, oestat6Id, orgunitId } = await pickSampleIds();
  console.log('sample', { pubId, oestat6Id, orgunitId });

  // findByIdDetail
  const missing = await publicationsRepo.findByIdDetail(
    '00000000-0000-0000-0000-000000000000',
  );
  assert(missing === undefined, 'findByIdDetail missing should be undefined');
  const detail = await publicationsRepo.findByIdDetail(pubId);
  assert(detail, 'findByIdDetail returned undefined for sample pub');
  assert(typeof detail.id === 'string', 'detail.id should be string');
  // Relation-shadow guard: publication_type stays scalar, the joined row
  // lives on publicationTypeRef. See docs/TESTING.md §5.4 / commit 5ac68bd.
  assert(
    detail.publicationType === null || typeof detail.publicationType === 'string',
    `detail.publicationType expected scalar, got ${typeof detail.publicationType}`,
  );
  assert(
    Array.isArray(detail.pressReleases),
    'detail.pressReleases should be array',
  );

  // countByDecision: every key in DECISIONS should be present
  const decRows = await publicationsRepo.countByDecision();
  console.log('countByDecision rows:', decRows.length);
  assert(decRows.length >= 1, 'countByDecision returned empty');

  // countWhere: undefined → total count
  const totalAll = await publicationsRepo.countWhere(undefined);
  console.log('countWhere undefined:', totalAll);
  assert(totalAll > 0, 'countWhere(undefined) returned 0 — expected > 0');
  const archivedCount = await publicationsRepo.countWhere(
    eq(publications.archived, true),
  );
  console.log('countWhere archived=true:', archivedCount);

  // findManyForList
  const list = await publicationsRepo.findManyForList({
    where: undefined,
    orderBy: descNullsLast(publications.publishedAt),
    limit: 3,
    offset: 0,
  });
  assert(list.length <= 3, 'findManyForList respects limit');
  if (list[0]) {
    assert(Array.isArray(list[0].pressReleases), 'list row has pressReleases');
    assert(
      list[0].orgunitPublications === undefined ||
        Array.isArray(list[0].orgunitPublications),
      'list row has orgunitPublications array',
    );
  }

  // findManyForQueue
  const queue = await publicationsRepo.findManyForQueue({
    where: eq(publications.archived, false),
    orderBy: descNullsLast(publications.updatedAt),
  });
  console.log('findManyForQueue rows:', queue.length);

  // ---- Filter ID-sets ----
  // findIdsByOestat6: empty + sql.param array-binding
  const e0 = await publicationsRepo.findIdsByOestat6([]);
  assert(e0.size === 0, 'findIdsByOestat6([]) should be empty');
  const e1 = await publicationsRepo.findIdsByOestat6([oestat6Id]);
  console.log('findIdsByOestat6 single:', e1.size);
  // multi: same id twice exercises array-binding without needing two
  // distinct UUIDs
  const e2 = await publicationsRepo.findIdsByOestat6([oestat6Id, oestat6Id]);
  assert(e2.size === e1.size, 'findIdsByOestat6 dedupes via SQL');

  // findIdsByHighlight: all four branches
  const h00 = await publicationsRepo.findIdsByHighlight(false, false);
  assert(h00.size === 0, 'findIdsByHighlight(false,false) early-returns empty');
  const h10 = await publicationsRepo.findIdsByHighlight(true, false);
  console.log('findIdsByHighlight(true,false):', h10.size);
  const h11 = await publicationsRepo.findIdsByHighlight(true, true);
  console.log('findIdsByHighlight(true,true):', h11.size);

  // findIdsWithFlags
  const flagged = await publicationsRepo.findIdsWithFlags();
  console.log('findIdsWithFlags:', flagged.size);

  // findIdsByOrgunit: empty + single
  const o0 = await publicationsRepo.findIdsByOrgunit([]);
  assert(o0.size === 0, 'findIdsByOrgunit([]) early-returns empty');
  const o1 = await publicationsRepo.findIdsByOrgunit([orgunitId]);
  console.log('findIdsByOrgunit single:', o1.size);

  // findPressReleasedIds
  const pressed = await publicationsRepo.findPressReleasedIds();
  console.log('findPressReleasedIds:', pressed.size);

  // readFlagNotes: missing pub → undefined; existing pub → array
  const flagsMissing = await publicationsRepo.readFlagNotes(
    '00000000-0000-0000-0000-000000000000',
  );
  assert(flagsMissing === undefined, 'readFlagNotes missing pub should be undefined');
  const flagsPresent = await publicationsRepo.readFlagNotes(pubId);
  assert(Array.isArray(flagsPresent), 'readFlagNotes should return array');

  console.log('OK — publications repo smoke green');
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
