#!/usr/bin/env node
/**
 * Push locally-computed analysis columns (press_score + the 5 dimensions + the
 * 5 text fields + haiku + llm_model) from the LOCAL DB to PROD.
 *
 * WHY THIS EXISTS / what the 2026-06-02 re-import taught us
 * --------------------------------------------------------
 * Prod lags one full re-import behind local. A freshly re-imported + scored
 * 2026 batch splits into TWO populations in prod:
 *   (1) pubs that ALREADY EXIST in prod (from an earlier push) with
 *       press_score IS NULL  → a plain column UPDATE lands the score. SAFE.
 *   (2) pubs that DO NOT EXIST in prod yet (brand-new rows from this import)
 *       → an analysis UPDATE matches nothing. They need a full publication-row
 *       INSERT incl. their relations (orgunit links etc.) — that is the larger,
 *       still-unverified "Phase 7" full publication sync, NOT this script's job.
 * This script does (1) only, and REPORTS (2) loudly so nothing is silently
 * dropped. Run a full publication sync separately to land the missing rows.
 *
 * Matching is by publications.id (uuid). The importer keeps ids stable across
 * re-imports, so a local id present in prod is the same publication.
 *
 * Safety:
 *   - dry-run by default; --apply required to write.
 *   - never clobbers an existing prod score: the UPDATE carries
 *     `AND press_score IS NULL` unless --overwrite is passed (mirrors the local
 *     `session-pipeline apply` guard).
 *   - single transaction: any error → full ROLLBACK.
 *   - sets updated_at = NOW() explicitly (no PG trigger on publications).
 *
 * Usage:
 *   node scripts/push-analysis-to-prod.mjs                      # dry-run, all locally-scored pubs
 *   node scripts/push-analysis-to-prod.mjs --since=2026-01-01   # restrict by published_at
 *   node scripts/push-analysis-to-prod.mjs --ids=/tmp/ids.txt   # explicit id allow-list (one uuid/line)
 *   node scripts/push-analysis-to-prod.mjs --apply              # write (guarded: prod NULL only)
 *   node scripts/push-analysis-to-prod.mjs --apply --overwrite  # also refresh prod rows that already have a score
 */
import { connectDb } from './lib/db.mjs';
import { readFileSync } from 'fs';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (k) => { const a = argv.find((x) => x.startsWith(k + '=')); return a ? a.slice(k.length + 1) : null; };

const apply = has('--apply');
const overwrite = has('--overwrite');
const since = val('--since');
const idsFile = val('--ids');

const ANALYSIS_COLS = [
  'analysis_status', 'press_score',
  'public_accessibility', 'societal_relevance', 'novelty_factor',
  'storytelling_potential', 'media_timeliness',
  'pitch_suggestion', 'target_audience', 'suggested_angle', 'reasoning',
  'haiku', 'llm_model', 'analysis_cost',
];

let idAllow = null;
if (idsFile) {
  idAllow = readFileSync(idsFile, 'utf-8').split(/\s+/).map((s) => s.trim()).filter(Boolean);
}

const local = await connectDb({ target: 'local' });
const prod = await connectDb({ target: 'prod' });
try {
  // 1. Pull locally-scored pubs (optionally filtered).
  const where = ['press_score IS NOT NULL'];
  const params = [];
  if (since) { params.push(since); where.push(`published_at >= $${params.length}`); }
  if (idAllow) { params.push(idAllow); where.push(`id = ANY($${params.length}::uuid[])`); }
  const localRows = (await local.query(
    `SELECT id, ${ANALYSIS_COLS.join(', ')} FROM publications WHERE ${where.join(' AND ')}`,
    params
  )).rows;
  console.log(`Local scored pubs in scope: ${localRows.length}`);
  if (localRows.length === 0) { console.log('Nothing to push.'); process.exit(0); }

  // 2. Which of them exist in prod, and what is their current score?
  const ids = localRows.map((r) => r.id);
  const prodRows = (await prod.query(
    `SELECT id, press_score FROM publications WHERE id = ANY($1::uuid[])`,
    [ids]
  )).rows;
  const prodScoreById = new Map(prodRows.map((r) => [r.id, r.press_score]));

  const present = localRows.filter((r) => prodScoreById.has(r.id));
  const missing = localRows.filter((r) => !prodScoreById.has(r.id));
  const presentNull = present.filter((r) => prodScoreById.get(r.id) === null);
  const presentScored = present.filter((r) => prodScoreById.get(r.id) !== null);

  console.log(`  present in prod : ${present.length}  (NULL score: ${presentNull.length}, already scored: ${presentScored.length})`);
  console.log(`  MISSING in prod : ${missing.length}  → need full publication-row sync (Phase 7), NOT pushed here`);
  if (missing.length) {
    const m = await local.query(`SELECT id, webdb_uid, left(title,50) t FROM publications WHERE id = ANY($1::uuid[]) ORDER BY webdb_uid`, [missing.map((r) => r.id)]);
    for (const row of m.rows) console.log(`      missing: uid=${row.webdb_uid} ${row.t}`);
  }

  const toWrite = overwrite ? present : presentNull;
  console.log(`\n${apply ? 'APPLY' : 'DRY-RUN'}: ${toWrite.length} prod row(s) would be ${overwrite ? 'written (incl. overwrite)' : 'updated (prod NULL only)'}.`);
  if (!overwrite && presentScored.length) console.log(`  (${presentScored.length} prod rows already scored are protected; pass --overwrite to refresh them.)`);

  if (!apply) { console.log('\nRe-run with --apply to write.'); process.exit(0); }
  if (toWrite.length === 0) { console.log('Nothing to write.'); process.exit(0); }

  // 3. Write, single transaction, guarded per-row UPDATE.
  const setList = ANALYSIS_COLS.map((c, i) => `${c} = $${i + 2}`).join(',\n          ');
  const guard = overwrite ? '' : ' AND press_score IS NULL';
  await prod.query('BEGIN');
  let updated = 0, skipped = 0;
  try {
    for (const r of toWrite) {
      const res = await prod.query(
        `UPDATE publications SET
          ${setList},
          updated_at = NOW()
        WHERE id = $1${guard}`,
        [r.id, ...ANALYSIS_COLS.map((c) => r[c])]
      );
      if (res.rowCount > 0) updated++; else skipped++;
    }
    await prod.query('COMMIT');
  } catch (e) {
    await prod.query('ROLLBACK');
    console.error('UPDATE failed, rolled back:', e.message);
    process.exit(1);
  }
  console.log(`Done. Updated ${updated}, skipped ${skipped}.`);

  const after = await prod.query(`SELECT count(*) FILTER (WHERE press_score IS NOT NULL) scored FROM publications`);
  console.log(`Prod scored total now: ${after.rows[0].scored}`);
} finally {
  await local.end();
  await prod.end();
}
