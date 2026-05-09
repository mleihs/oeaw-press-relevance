#!/usr/bin/env node
/**
 * Recompute publications.press_score for all analyzed pubs using the current
 * SCORE_WEIGHTS in lib/score-weights.json. Use after weight recalibration so
 * the JS-computed scores in the DB stay in lockstep with the declared weights.
 *
 * Sets updated_at = now() explicitly because there is no PG trigger on
 * publications (see memory: prod_haiku_drift.md).
 *
 * Usage:
 *   node scripts/recompute-press-scores.mjs                  # dry-run, prints diff stats
 *   node scripts/recompute-press-scores.mjs --apply          # writes to local DB
 *   node scripts/recompute-press-scores.mjs --apply --target=prod
 */
import { connectDb, parseScriptArgs } from './lib/db.mjs';
import { readFileSync } from 'fs';

const weights = JSON.parse(readFileSync(new URL('../lib/score-weights.json', import.meta.url), 'utf-8'));
const SUM = Object.values(weights).reduce((s, v) => s + v, 0);
if (Math.abs(SUM - 1.0) > 1e-9) {
  console.error(`[fatal] score-weights.json sums to ${SUM}, expected 1.0`);
  process.exit(2);
}

const args = parseScriptArgs();
const apply = args.flags.includes('--apply');

console.log(`Target: ${args.target}`);
console.log(`Weights:`, weights);
console.log(`Mode: ${apply ? 'APPLY' : 'dry-run (no write)'}`);

const db = await connectDb({ target: args.target });

const { rows } = await db.query(`
  SELECT id, press_score AS old_score,
         public_accessibility, societal_relevance, novelty_factor,
         storytelling_potential, media_timeliness
  FROM publications
  WHERE press_score IS NOT NULL
`);
console.log(`Loaded ${rows.length} analyzed publications.`);

function newScore(r) {
  return (
    weights.public_accessibility   * (r.public_accessibility   ?? 0) +
    weights.societal_relevance     * (r.societal_relevance     ?? 0) +
    weights.novelty_factor         * (r.novelty_factor         ?? 0) +
    weights.storytelling_potential * (r.storytelling_potential ?? 0) +
    weights.media_timeliness       * (r.media_timeliness       ?? 0)
  );
}

let nUp = 0, nDown = 0, nSame = 0;
let absDeltaSum = 0, maxDelta = 0;
const updates = [];
for (const r of rows) {
  const ns = newScore(r);
  const old = Number(r.old_score);
  const delta = ns - old;
  if (Math.abs(delta) < 1e-9) nSame++;
  else if (delta > 0) nUp++;
  else nDown++;
  absDeltaSum += Math.abs(delta);
  if (Math.abs(delta) > maxDelta) maxDelta = Math.abs(delta);
  updates.push({ id: r.id, old_score: old, new_score: ns });
}

console.log(`\nDiff vs current DB:`);
console.log(`  unchanged: ${nSame}`);
console.log(`  increased: ${nUp}`);
console.log(`  decreased: ${nDown}`);
console.log(`  mean |Δ| : ${(absDeltaSum / rows.length).toFixed(4)}`);
console.log(`  max  |Δ| : ${maxDelta.toFixed(4)}`);

const sortedDelta = updates.map(u => u.new_score - u.old_score).sort((a, b) => a - b);
const q = (p) => sortedDelta[Math.floor((sortedDelta.length - 1) * p)];
console.log(`  Δ p10/p25/p50/p75/p90: ${q(0.1).toFixed(3)} / ${q(0.25).toFixed(3)} / ${q(0.5).toFixed(3)} / ${q(0.75).toFixed(3)} / ${q(0.9).toFixed(3)}`);

if (!apply) {
  console.log(`\nDry-run complete. Re-run with --apply to write.`);
  await db.end();
  process.exit(0);
}

console.log(`\nApplying...`);
// Bulk UPDATE via UNNEST: faster than per-row.
await db.query('BEGIN');
try {
  const ids = updates.map(u => u.id);
  const scores = updates.map(u => u.new_score);
  await db.query(
    `UPDATE publications p
     SET press_score = u.new_score,
         updated_at  = now()
     FROM (SELECT * FROM unnest($1::uuid[], $2::float8[]) AS t(id, new_score)) u
     WHERE p.id = u.id`,
    [ids, scores]
  );
  const after = await db.query(`SELECT COUNT(*) AS n, AVG(press_score) AS m
                                FROM publications WHERE press_score IS NOT NULL`);
  await db.query('COMMIT');
  console.log(`Done. Post-update mean press_score = ${Number(after.rows[0].m).toFixed(4)} over ${after.rows[0].n} pubs.`);
} catch (e) {
  await db.query('ROLLBACK');
  console.error('UPDATE failed, rolled back:', e);
  process.exit(1);
}

await db.end();
