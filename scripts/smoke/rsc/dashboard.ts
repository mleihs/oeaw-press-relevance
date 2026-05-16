/**
 * Smoke test for `lib/server/dashboard/fetch.ts::getDashboardData` — the
 * data path the Phase A4 Phase-2 RSC dashboard (`app/page.tsx`) uses.
 *
 * Read-only. Exercises every wrapper-call shape the RSC page makes:
 *   1. getDashboardData('month')  — default time period
 *   2. getDashboardData('all')    — universe (no published_after)
 *   3. getDashboardData('week')   — narrower window, top-10 may be smaller
 *
 * Guards:
 *   - stats counters non-negative + shape (10 score-distribution buckets)
 *   - flagged/pressReleased/orphans counts non-negative
 *   - top-10 capped at 10 rows + only `analysis_status === 'analyzed'`
 *   - top-10 sorted by press_score descending (ORDER BY contract)
 *   - period='all' top-10 count ≥ period='month' top-10 count (monotonic
 *     under widening time window)
 *   - periodCounts: 4 non-negative numbers, monotonic (week≤month≤year≤
 *     all), period-independent, and periodCounts[period] === topPubsTotal
 *     (hard parity check that the SQL predicate mirrors listPublications)
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54422/postgres' \
 *     npx tsx scripts/smoke/rsc/dashboard.ts
 */

import { getDashboardData } from '../../../lib/server/dashboard/fetch';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

// Mirror app/page.tsx default — keep smoke assertions in sync with the UI.
const SMOKE_LIMIT = 20;

async function main() {
  // 1. Default period
  const month = await getDashboardData('month', SMOKE_LIMIT);
  assert(month.stats.total >= 0, 'month stats.total negative');
  assert(month.stats.analyzed >= 0, 'month stats.analyzed negative');
  assert(month.stats.high_score_count >= 0, 'month stats.high_score_count negative');
  assert(
    month.stats.score_distribution.length === 10,
    `score_distribution length ${month.stats.score_distribution.length} !== 10`,
  );
  assert(
    month.stats.similarity_distribution.length === 10,
    `similarity_distribution length ${month.stats.similarity_distribution.length} !== 10`,
  );
  assert(
    month.stats.similarity_distribution.every((v) => v >= 0),
    `similarity_distribution has negative entries: ${JSON.stringify(month.stats.similarity_distribution)}`,
  );
  assert(
    typeof month.stats.dimension_avgs === 'object',
    'dimension_avgs not object',
  );
  assert(Array.isArray(month.stats.top_keywords), 'top_keywords not array');
  assert(
    Array.isArray(month.scoreSimilarityPoints),
    'scoreSimilarityPoints not array',
  );
  assert(
    month.scoreSimilarityPoints.every(
      (pt) =>
        Array.isArray(pt) &&
        pt.length === 2 &&
        pt[0] >= 0 &&
        pt[0] <= 1 &&
        pt[1] >= 0 &&
        pt[1] <= 1,
    ),
    'scoreSimilarityPoints has out-of-range or malformed [s,p] tuples',
  );
  assert(month.flaggedCount >= 0, 'flaggedCount negative');
  assert(month.pressReleasedCount >= 0, 'pressReleasedCount negative');
  assert(month.orphansCount >= 0, 'orphansCount negative');
  assert(
    month.topPubs.length <= SMOKE_LIMIT,
    `topPubs.length ${month.topPubs.length} > ${SMOKE_LIMIT}`,
  );
  assert(
    month.topPubsTotal >= month.topPubs.length,
    `topPubsTotal ${month.topPubsTotal} < topPubs.length ${month.topPubs.length}`,
  );
  assert(
    month.topPubsLimit === SMOKE_LIMIT,
    `topPubsLimit ${month.topPubsLimit} !== requested ${SMOKE_LIMIT}`,
  );
  for (const pub of month.topPubs) {
    assert(
      pub.analysis_status === 'analyzed',
      `top-pub row ${pub.id} analysis_status=${pub.analysis_status} (must be analyzed)`,
    );
    assert(
      pub.popular_science !== true,
      `top-pub row ${pub.id} popular_science=true (filter says false)`,
    );
  }
  // Top-N must be sorted by press_score desc — non-null block first.
  let lastScore: number | null = null;
  for (const pub of month.topPubs) {
    if (pub.press_score === null) continue;
    if (lastScore !== null) {
      assert(
        pub.press_score <= lastScore,
        `top-pubs not sorted desc: ${pub.press_score} > ${lastScore} for ${pub.id}`,
      );
    }
    lastScore = pub.press_score;
  }
  console.log(
    `  ok: month stats total=${month.stats.total} analyzed=${month.stats.analyzed} highScore=${month.stats.high_score_count} `
      + `topPubs=${month.topPubs.length}/${month.topPubsTotal} flagged=${month.flaggedCount} pressed=${month.pressReleasedCount} orphans=${month.orphansCount}`,
  );

  // periodCounts — the SQL fn ignores the requested period and always
  // returns all four; non-negative; monotonic under widening window; and
  // the current period's count MUST equal topPubsTotal (the hard parity
  // check that publication_period_counts mirrors listPublications).
  const pc = month.periodCounts;
  assert(
    typeof pc.week === 'number' && typeof pc.month === 'number'
      && typeof pc.year === 'number' && typeof pc.all === 'number',
    `periodCounts not all numbers: ${JSON.stringify(pc)}`,
  );
  assert(
    pc.week >= 0 && pc.month >= 0 && pc.year >= 0 && pc.all >= 0,
    `periodCounts has negative entries: ${JSON.stringify(pc)}`,
  );
  assert(
    pc.week <= pc.month && pc.month <= pc.year && pc.year <= pc.all,
    `periodCounts not monotonic (week≤month≤year≤all): ${JSON.stringify(pc)}`,
  );
  assert(
    pc.month === month.topPubsTotal,
    `periodCounts.month ${pc.month} !== month.topPubsTotal ${month.topPubsTotal} `
      + `(SQL predicate must mirror listPublications exactly)`,
  );
  console.log(`  ok: periodCounts ${JSON.stringify(pc)} (parity month=${month.topPubsTotal})`);

  // 2. period='all' — top-N covers the universe (≥ any narrower window)
  const all = await getDashboardData('all', SMOKE_LIMIT);
  assert(
    all.stats.total === month.stats.total,
    `'all' stats.total ${all.stats.total} !== 'month' stats.total ${month.stats.total} (stats are period-independent)`,
  );
  assert(
    all.topPubs.length >= month.topPubs.length,
    `'all' top-N count ${all.topPubs.length} < 'month' top-N count ${month.topPubs.length} (widening window must not shrink)`,
  );
  assert(
    all.periodCounts.all === all.topPubsTotal,
    `periodCounts.all ${all.periodCounts.all} !== all.topPubsTotal ${all.topPubsTotal} (predicate parity)`,
  );
  assert(
    JSON.stringify(all.periodCounts) === JSON.stringify(month.periodCounts),
    `periodCounts is period-dependent: all=${JSON.stringify(all.periodCounts)} `
      + `month=${JSON.stringify(month.periodCounts)} (the SQL fn must ignore the requested period)`,
  );
  console.log(`  ok: all topPubs=${all.topPubs.length}/${all.topPubsTotal} (≥ month=${month.topPubs.length})`);

  // 3. period='week' — narrower, top-N may be smaller, structurally same
  const week = await getDashboardData('week', SMOKE_LIMIT);
  assert(
    week.topPubs.length <= SMOKE_LIMIT,
    `week top-N length ${week.topPubs.length} > ${SMOKE_LIMIT}`,
  );
  assert(
    week.topPubs.length <= all.topPubs.length,
    `week top-N ${week.topPubs.length} > all top-N ${all.topPubs.length} (narrower window must not grow)`,
  );
  assert(
    week.periodCounts.week === week.topPubsTotal,
    `periodCounts.week ${week.periodCounts.week} !== week.topPubsTotal ${week.topPubsTotal} (predicate parity)`,
  );
  console.log(`  ok: week top10=${week.topPubs.length} (≤ all=${all.topPubs.length})`);

  console.log('PASS — dashboard fetch smoke');
  process.exit(0);
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
