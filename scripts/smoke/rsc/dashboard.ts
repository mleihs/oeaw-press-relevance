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

async function main() {
  // 1. Default period
  const month = await getDashboardData('month');
  assert(month.stats.total >= 0, 'month stats.total negative');
  assert(month.stats.analyzed >= 0, 'month stats.analyzed negative');
  assert(month.stats.high_score_count >= 0, 'month stats.high_score_count negative');
  assert(
    month.stats.score_distribution.length === 10,
    `score_distribution length ${month.stats.score_distribution.length} !== 10`,
  );
  assert(
    typeof month.stats.dimension_avgs === 'object',
    'dimension_avgs not object',
  );
  assert(Array.isArray(month.stats.top_keywords), 'top_keywords not array');
  assert(month.flaggedCount >= 0, 'flaggedCount negative');
  assert(month.pressReleasedCount >= 0, 'pressReleasedCount negative');
  assert(month.orphansCount >= 0, 'orphansCount negative');
  assert(
    month.topPubs.length <= 10,
    `topPubs.length ${month.topPubs.length} > 10`,
  );
  for (const pub of month.topPubs) {
    assert(
      pub.analysis_status === 'analyzed',
      `top-10 row ${pub.id} analysis_status=${pub.analysis_status} (must be analyzed)`,
    );
    assert(
      pub.popular_science !== true,
      `top-10 row ${pub.id} popular_science=true (filter says false)`,
    );
  }
  // Top-10 must be sorted by press_score desc — non-null block first.
  let lastScore: number | null = null;
  for (const pub of month.topPubs) {
    if (pub.press_score === null) continue;
    if (lastScore !== null) {
      assert(
        pub.press_score <= lastScore,
        `top-10 not sorted desc: ${pub.press_score} > ${lastScore} for ${pub.id}`,
      );
    }
    lastScore = pub.press_score;
  }
  console.log(
    `  ok: month stats total=${month.stats.total} analyzed=${month.stats.analyzed} highScore=${month.stats.high_score_count} `
      + `top10=${month.topPubs.length} flagged=${month.flaggedCount} pressed=${month.pressReleasedCount} orphans=${month.orphansCount}`,
  );

  // 2. period='all' — top-10 covers the universe (≥ any narrower window)
  const all = await getDashboardData('all');
  assert(
    all.stats.total === month.stats.total,
    `'all' stats.total ${all.stats.total} !== 'month' stats.total ${month.stats.total} (stats are period-independent)`,
  );
  assert(
    all.topPubs.length >= month.topPubs.length,
    `'all' top-10 count ${all.topPubs.length} < 'month' top-10 count ${month.topPubs.length} (widening window must not shrink)`,
  );
  console.log(`  ok: all top10=${all.topPubs.length} (≥ month=${month.topPubs.length})`);

  // 3. period='week' — narrower, top-10 may be smaller, structurally same
  const week = await getDashboardData('week');
  assert(
    week.topPubs.length <= 10,
    `week top-10 length ${week.topPubs.length} > 10`,
  );
  assert(
    week.topPubs.length <= all.topPubs.length,
    `week top-10 ${week.topPubs.length} > all top-10 ${all.topPubs.length} (narrower window must not grow)`,
  );
  console.log(`  ok: week top10=${week.topPubs.length} (≤ all=${all.topPubs.length})`);

  console.log('PASS — dashboard fetch smoke');
  process.exit(0);
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
