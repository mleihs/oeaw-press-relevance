/**
 * Smoke test for `lib/server/review/queue.ts::buildReviewQueue` — the data
 * path the /review page hits via /api/review/queue.
 *
 * Read-only. Verifies the per-decision queue shapes:
 *   1. undecided + press_score sort         — counts shape + ranking sanity
 *   2. undecided + combined sort            — ranked.length unchanged
 *   3. pitch tab                            — only decision='pitch' rows
 *   4. hold tab                             — only decision='hold' rows
 *   5. skip tab                             — only decision='skip' rows
 *   6. invalid decision param               — falls back to undecided
 *   7. decision_counts invariant            — sum of per-decision counts >= total in tab
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54422/postgres' \
 *     npx tsx scripts/smoke/rsc/review.ts
 */

import { buildReviewQueue } from '../../../lib/server/review/queue';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function params(o: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams(o);
}

async function main() {
  // 1. undecided + default (press_score) sort
  const undecided = await buildReviewQueue(params({ decision: 'undecided' }));
  assert(undecided.sort === 'press_score' || undecided.publications.length === 0,
    `undecided default sort: expected press_score, got ${undecided.sort}`);
  assert(undecided.counts.total === undecided.publications.length,
    `total ${undecided.counts.total} !== rows.length ${undecided.publications.length}`);
  assert(undecided.counts.flagged >= 0 && undecided.counts.mahl >= 0 && undecided.counts.fresh >= 0,
    'counters negative');
  console.log(
    `  ok: undecided total=${undecided.counts.total} flagged=${undecided.counts.flagged} ` +
      `mahl=${undecided.counts.mahl} fresh=${undecided.counts.fresh}`,
  );

  // 2. undecided + combined sort
  const combined = await buildReviewQueue(params({ decision: 'undecided', sort: 'combined' }));
  if (undecided.counts.total > 0) {
    assert(combined.sort === 'combined', `combined sort label: ${combined.sort}`);
    assert(combined.publications.length === undecided.publications.length,
      `combined length ${combined.publications.length} !== press_score length ${undecided.publications.length}`);
  }
  console.log(`  ok: combined sort total=${combined.counts.total} (same set, re-ranked)`);

  // 3-5. Decided buckets
  for (const decision of ['pitch', 'hold', 'skip'] as const) {
    const bucket = await buildReviewQueue(params({ decision }));
    assert(bucket.sort === 'decided_at' || bucket.publications.length === 0,
      `${decision} sort: expected decided_at, got ${bucket.sort}`);
    for (const pub of bucket.publications) {
      assert(pub.decision === decision,
        `${decision} bucket contains row with decision=${pub.decision}`);
    }
    console.log(`  ok: ${decision} bucket — total=${bucket.publications.length}, all match`);
  }

  // 6. Invalid decision falls back to undecided
  const invalid = await buildReviewQueue(params({ decision: 'invalid_status' }));
  assert(invalid.counts.total === undecided.counts.total,
    `invalid decision should equal undecided: ${invalid.counts.total} vs ${undecided.counts.total}`);
  console.log('  ok: invalid decision → falls back to undecided');

  // 7. decision_counts invariant: sum of all decision counts === total per-decision view
  const allDecisions = undecided.decision_counts;
  const totalAcrossDecisions =
    allDecisions.undecided + allDecisions.pitch + allDecisions.hold + allDecisions.skip;
  assert(totalAcrossDecisions >= undecided.counts.total,
    `decision_counts sum ${totalAcrossDecisions} < undecided count ${undecided.counts.total}`);
  console.log(`  ok: decision_counts invariant (${totalAcrossDecisions} >= ${undecided.counts.total})`);

  console.log('PASS — review queue smoke');
  process.exit(0);
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
