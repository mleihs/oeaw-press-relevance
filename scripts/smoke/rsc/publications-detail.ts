/**
 * Smoke test for `lib/server/publications/fetch.ts::getPublicationById` —
 * the wrapper the Phase-A4 phase-1 RSC page (`app/publications/[id]/page.tsx`)
 * and the `/api/publications/[id]` route share.
 *
 * Read-only. Exercises the branches the wrapper has:
 *   1. valid id → `PublicationWithRelations` with relation flattening
 *   2. valid uuid shape but absent from publications → `null`
 *   3. (spot-check) wire-shape keys the detail page reads — drift in the
 *      Drizzle row → wire shape mapping is the bug this guards against.
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54422/postgres' \
 *     npx tsx scripts/smoke/rsc/publications-detail.ts
 */

import { sql } from 'drizzle-orm';
import { getPublicationById } from '../../../lib/server/publications/fetch';
import { db } from '../../../lib/server/db';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

async function pickRealPubId(): Promise<string> {
  // Prefer a non-archived pub with at least one author so the
  // `authors_resolved` flattening is exercised.
  const rows = (await db.execute(
    sql`SELECT p.id
        FROM publications p
        WHERE p.archived = false
          AND EXISTS (SELECT 1 FROM person_publications pp WHERE pp.publication_id = p.id)
        ORDER BY p.updated_at DESC
        LIMIT 1`,
  )) as unknown as Array<{ id: string }>;
  assert(rows[0]?.id, 'no eligible publications in DB — smoke needs a populated local DB');
  return rows[0].id;
}

async function main() {
  const realId = await pickRealPubId();

  // 1. valid id → populated detail
  const pub = await getPublicationById(realId);
  assert(pub !== null, `expected publication for ${realId}, got null`);
  assert(pub.id === realId, 'pub.id mismatch');
  // Required keys per `PublicationWithRelations` — guards against a column
  // rename in `publications` silently dropping fields from `publicationToApi`.
  for (const k of [
    'title', 'doi', 'enrichment_status', 'analysis_status', 'press_score',
    'decision', 'flag_notes', 'created_at', 'updated_at',
  ] as const) {
    assert(k in pub, `key ${k} missing in PublicationWithRelations`);
  }
  // ISO-8601 normalisation guard (docs/TESTING.md §5.2) — created_at must
  // be ISO-Z, not the raw PG timestamp.
  assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(pub.created_at), 'created_at not ISO-8601');
  // Optional relation arrays — present (possibly empty) after the
  // flattening step in `fetch.ts`.
  assert(Array.isArray(pub.authors_resolved), 'authors_resolved must be an array');
  assert(Array.isArray(pub.orgunits), 'orgunits must be an array');
  assert(Array.isArray(pub.projects), 'projects must be an array');
  // flag_notes is a Publication-level field; the DTO declares it required.
  assert(Array.isArray(pub.flag_notes), 'flag_notes must be an array');
  // `press_release` is optional + nullable: may be null (no PR), or an
  // object. Object case requires `url` per the wire shape.
  if (pub.press_release !== null && pub.press_release !== undefined) {
    assert(typeof pub.press_release.url === 'string', 'press_release.url must be string');
  }
  // Relation-shadowing guard (docs/TESTING.md §5.4) — `publication_type`
  // is a denormalised text scalar; never an object.
  assert(
    pub.publication_type === null || typeof pub.publication_type === 'string',
    `publication_type should be string|null, got ${typeof pub.publication_type}`,
  );
  console.log(`  ok: real id → "${pub.title.slice(0, 60)}…"`);
  console.log(`     authors=${pub.authors_resolved!.length} orgunits=${pub.orgunits!.length} projects=${pub.projects!.length} press_release=${pub.press_release ? 'yes' : 'no'}`);

  // 2. valid uuid shape but absent → null
  const absent = '00000000-0000-0000-0000-000000000000';
  const miss = await getPublicationById(absent);
  assert(miss === null, `expected null for unknown UUID, got ${typeof miss}`);
  console.log('  ok: unknown id → null');

  console.log('PASS — getPublicationById smoke');
  process.exit(0);
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
