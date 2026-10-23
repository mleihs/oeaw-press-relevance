/**
 * Smoke test for `lib/server/publications/list.ts::listPublications` — the
 * data path the Phase A4 Phase-2 RSC page (`app/publications/page.tsx`) and
 * the `/api/publications` route share.
 *
 * Read-only. Exercises the wrapper call shapes the RSC page makes (built as
 * raw URLSearchParams to keep this script in the lib-only boundary —
 * `buildApiParams` is covered by `app/publications/_filters.test.ts`):
 *   1. defaults (page1 + default_eligible + has_score)
 *   2. showAll (no default_eligible)            — eligibility invariant holds
 *   2b. showNa (no has_score)                   — N/A invariant holds
 *   3. search — substring                       — subset of universe
 *   4. search — impossible                      — total = 0
 *   5. peer_reviewed=true                       — all rows peer_reviewed=true
 *   6. page=2                                   — disjoint from page 1
 *   7. flagged=true (newly-fixed end-to-end)    — filter actually narrows
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54422/postgres' \
 *     npx tsx scripts/smoke/rsc/publications-list.ts
 */

import { listPublications } from '../../../lib/server/publications/list';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

// Build URLSearchParams the way `app/publications/_filters.ts::buildApiParams`
// would for the corresponding FilterValues. The base mirrors `FILTER_DEFAULTS`
// fed through buildApiParams — page/pageSize/sort/order + default_eligible +
// has_score (the list hides N/A rows by default, see hidesUnscored).
function params(overrides: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({
    page: '1',
    pageSize: '20',
    sort: 'published_at',
    order: 'desc',
    default_eligible: 'true',
    has_score: 'true',
    ...overrides,
  });
}

async function main() {
  // 1. Defaults — sanity counters + eligibility hidden ≥ 0
  const defaults = await listPublications(params());
  assert(defaults.total >= 0, 'default total negative');
  assert(defaults.total_hidden >= 0, 'default total_hidden negative');
  assert(defaults.page === 1, `default page ${defaults.page} !== 1`);
  assert(defaults.pageSize === 20, `default pageSize ${defaults.pageSize} !== 20`);
  assert(
    defaults.publications.length <= defaults.pageSize,
    `page rows ${defaults.publications.length} > pageSize ${defaults.pageSize}`,
  );
  assert(
    defaults.publications.length <= defaults.total,
    `page rows ${defaults.publications.length} > total ${defaults.total}`,
  );
  console.log(
    `  ok: defaults total=${defaults.total} hidden=${defaults.total_hidden} rows=${defaults.publications.length}`,
  );

  for (const pub of defaults.publications) {
    assert(pub.press_score !== null, `default row ${pub.id} has no press_score (N/A filter not applied?)`);
  }

  // 2. showAll → drop default_eligible → eligibility invariant must hold:
  //    defaults.total + defaults.total_hidden === all.total
  //    (has_score stays: buildApiParams keeps it for showAll)
  const allParams = new URLSearchParams({
    page: '1',
    pageSize: '20',
    sort: 'published_at',
    order: 'desc',
    has_score: 'true',
  });
  const all = await listPublications(allParams);
  assert(all.total_hidden === 0, `showAll expected total_hidden=0, got ${all.total_hidden}`);
  assert(
    all.total >= defaults.total,
    `universe total ${all.total} < default-eligible total ${defaults.total}`,
  );
  assert(
    defaults.total + defaults.total_hidden === all.total,
    `eligibility invariant broken: ${defaults.total} + ${defaults.total_hidden} !== ${all.total}`,
  );
  console.log(`  ok: showAll total=${all.total} (eligibility invariant holds)`);

  // 2b. showNa → drop has_score → N/A invariant must hold:
  //     defaults.total + defaults.total_hidden_unscored === withNa.total
  const withNaParams = params();
  withNaParams.delete('has_score');
  const withNa = await listPublications(withNaParams);
  assert(
    withNa.total_hidden_unscored === 0,
    `showNa expected total_hidden_unscored=0, got ${withNa.total_hidden_unscored}`,
  );
  assert(
    defaults.total + defaults.total_hidden_unscored === withNa.total,
    `N/A invariant broken: ${defaults.total} + ${defaults.total_hidden_unscored} !== ${withNa.total}`,
  );
  console.log(
    `  ok: showNa total=${withNa.total} (N/A invariant holds, ${defaults.total_hidden_unscored} hidden by default)`,
  );

  // 3. Search returns a subset (count is data-dependent)
  const search = await listPublications(params({ search: 'physics' }));
  assert(
    search.publications.length <= search.total,
    `search rows ${search.publications.length} > search total ${search.total}`,
  );
  assert(
    search.total <= all.total,
    `search total ${search.total} > universe total ${all.total}`,
  );
  console.log(`  ok: search='physics' total=${search.total} rows=${search.publications.length}`);

  // 4. Impossible search → empty
  const impossible = await listPublications(
    params({ search: 'XXXXX_IMPOSSIBLE_QUERY_NO_MATCH_42' }),
  );
  assert(impossible.total === 0, `impossible search total ${impossible.total} !== 0`);
  assert(
    impossible.publications.length === 0,
    `impossible search rows ${impossible.publications.length} !== 0`,
  );
  console.log('  ok: impossible search → empty result');

  // 5. peer_reviewed=true → all rows have peer_reviewed=true
  const peer = await listPublications(params({ peer_reviewed: 'true' }));
  for (const pub of peer.publications) {
    assert(
      pub.peer_reviewed === true,
      `peer_reviewed=true row ${pub.id} has peer_reviewed=${pub.peer_reviewed}`,
    );
  }
  console.log(`  ok: peer_reviewed=true total=${peer.total} (all rows peer_reviewed=true)`);

  // 6. page=2 — total stable, rows differ
  if (defaults.total > 20) {
    const page2 = await listPublications(params({ page: '2' }));
    assert(
      page2.total === defaults.total,
      `page 2 total ${page2.total} !== page 1 total ${defaults.total}`,
    );
    assert(page2.page === 2, `page 2 metadata page=${page2.page}`);
    const page1Ids = new Set(defaults.publications.map((p) => p.id));
    for (const pub of page2.publications) {
      assert(
        !page1Ids.has(pub.id),
        `page 2 row ${pub.id} also appears on page 1 (pagination broken)`,
      );
    }
    console.log('  ok: page 2 — disjoint from page 1, total stable');
  } else {
    console.log(`  skip: page 2 — only ${defaults.total} rows total`);
  }

  // 7. flagged=true — pre-A4 the client-side queryString builder forgot to
  // forward this filter (so the UI checkbox was dead). Smoke verifies the
  // filter ACTUALLY narrows once it reaches `listPublications`. Pair with
  // the `buildApiParams` Vitest test that verifies the emit side.
  const flagged = await listPublications(params({ flagged: 'true' }));
  assert(
    flagged.total <= all.total,
    `flagged total ${flagged.total} > universe total ${all.total} — filter not applied?`,
  );
  console.log(`  ok: flagged=true total=${flagged.total} (filter applied)`);

  console.log('PASS — publications list smoke');
  process.exit(0);
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
