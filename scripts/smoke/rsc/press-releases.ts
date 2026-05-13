/**
 * Smoke test for `lib/server/press-releases/list.ts` — the wrappers the
 * Phase-A4 phase-1 RSC page (`app/press-releases/page.tsx`) and the
 * `/api/press-releases` route share.
 *
 * Read-only. Exercises every wrapper-call shape the RSC page makes:
 *   1. getPressReleasesStats()                              — 5 counters
 *   2. listPressReleases({orphans: null,   withPub: true})  — `all` tab
 *   3. listPressReleases({orphans:'false', withPub: true})  — `matched`
 *   4. listPressReleases({orphans:'true',  withPub: false}) — `orphans`
 *
 * Guards:
 *   - stats counts non-negative + total = matched + orphans (disjoint sets)
 *   - matched rows have publication_id NOT NULL AND embedded `publication`
 *     in **snake_case** wire shape (`original_title`, `lead_author`,
 *     `press_score`, `press_similarity`, `published_at`)
 *   - orphans rows have publication_id NULL
 *   - released_at descending in every result (ORDER BY contract)
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54422/postgres' \
 *     npx tsx scripts/smoke/rsc/press-releases.ts
 */

import {
  getPressReleasesStats,
  listPressReleases,
} from '../../../lib/server/press-releases/list';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function isDescending(values: Array<string | null>): boolean {
  // released_at can be null; treat nulls as smallest so the ORDER BY desc
  // contract (Drizzle desc() puts NULL last in PG by default) is observable
  // as "non-null block is monotonically non-increasing, then nulls".
  let sawNull = false;
  let prev: string | null = null;
  for (const v of values) {
    if (v === null) {
      sawNull = true;
      continue;
    }
    if (sawNull) return false;
    if (prev !== null && v > prev) return false;
    prev = v;
  }
  return true;
}

async function main() {
  // 1. Stats
  const stats = await getPressReleasesStats();
  assert(stats.total >= 0, 'stats.total negative');
  assert(stats.matched >= 0, 'stats.matched negative');
  assert(stats.orphans >= 0, 'stats.orphans negative');
  assert(stats.this_month >= 0, 'stats.this_month negative');
  assert(stats.this_year >= 0, 'stats.this_year negative');
  assert(
    stats.matched + stats.orphans === stats.total,
    `matched (${stats.matched}) + orphans (${stats.orphans}) !== total (${stats.total})`,
  );
  assert(stats.this_month <= stats.this_year, 'this_month > this_year');
  assert(stats.this_year <= stats.total, 'this_year > total');
  console.log(
    `  ok: stats total=${stats.total} matched=${stats.matched} orphans=${stats.orphans} `
      + `this_year=${stats.this_year} this_month=${stats.this_month}`,
  );

  // 2. `all` tab — withPub=true returns matched rows with embedded publication
  const all = await listPressReleases({ orphans: null, withPub: true });
  assert(
    all.press_releases.length === stats.total,
    `all-list count ${all.press_releases.length} !== stats.total ${stats.total}`,
  );
  assert(all.total === stats.total, `all.total ${all.total} !== stats.total ${stats.total}`);
  assert(
    isDescending(all.press_releases.map((p) => p.released_at)),
    'all-list released_at not descending',
  );

  // The embed-shape check: properly typed now (no `as unknown as` cast).
  // Hard-guard: if stats.matched > 0, at least one row in the all-list MUST
  // have a populated `publication` subobject — and its keys MUST be the
  // snake-case wire shape that the UI consumes. Catches both regressions
  // (relation dropped) AND the latent camelCase/snake_case bug that the
  // pre-cleanup wrapper had.
  if (stats.matched > 0) {
    const matchedRow = all.press_releases.find((p) => p.publication_id !== null);
    assert(
      matchedRow !== undefined,
      `stats.matched=${stats.matched} but no all-list row has publication_id !== null`,
    );
    const pub = matchedRow.publication;
    assert(pub != null, 'all-list matched row: embedded `.publication` is null/undefined');
    assert(typeof pub.id === 'string', 'publication.id missing/not string');
    assert(typeof pub.title === 'string', 'publication.title missing/not string');
    for (const k of [
      'original_title',
      'lead_author',
      'citation',
      'press_score',
      'press_similarity',
      'decision',
      'published_at',
    ] as const) {
      assert(k in pub, `publication.${k} missing (wire shape must be snake_case)`);
    }
  }

  // 3. `matched` tab
  const matched = await listPressReleases({ orphans: 'false', withPub: true });
  assert(
    matched.press_releases.length === stats.matched,
    `matched-list count ${matched.press_releases.length} !== stats.matched ${stats.matched}`,
  );
  for (const p of matched.press_releases) {
    assert(p.publication_id !== null, `matched row has null publication_id (${p.id})`);
  }
  assert(
    isDescending(matched.press_releases.map((p) => p.released_at)),
    'matched-list released_at not descending',
  );

  // 4. `orphans` tab — no withPub (lightweight select)
  const orphans = await listPressReleases({ orphans: 'true', withPub: false });
  assert(
    orphans.press_releases.length === stats.orphans,
    `orphans-list count ${orphans.press_releases.length} !== stats.orphans ${stats.orphans}`,
  );
  for (const p of orphans.press_releases) {
    assert(p.publication_id === null, `orphan row has non-null publication_id (${p.id})`);
  }
  assert(
    isDescending(orphans.press_releases.map((p) => p.released_at)),
    'orphans-list released_at not descending',
  );

  console.log(
    `  ok: lists matched=${matched.press_releases.length} orphans=${orphans.press_releases.length} all=${all.press_releases.length}`,
  );
  console.log('PASS — press-releases list/stats smoke');
  process.exit(0);
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
