#!/usr/bin/env node
/**
 * One-off normalization of em-dashes (U+2014) in LLM-GENERATED text columns.
 *
 * Why: em-dashes read as machine-generated and are forbidden in UI copy
 * (docs/writing-style.md + the ESLint/MDX lint gates). Those gates only see
 * SOURCE code; generated DB content slips past them. Going forward the scoring
 * ingest sanitizer (scripts/session-pipeline.mjs sanitizeText) + the prompt
 * rule prevent new ones; this script repairs the existing backlog.
 *
 * Scope: ONLY the generated analysis columns. Bibliographic fields
 * (title, enriched_abstract, summary_de/en) are ORIGINAL source text — their
 * dashes are legitimate and are NOT touched.
 *
 * Transform: minimal — an em-dash (with surrounding spaces) becomes a comma;
 * no other reformatting. Matches sanitizeText's normalization.
 *
 * DRY-RUN by default (no writes). Pass --apply to write. --target=local|prod
 * (default prod). Single transaction; only rows that actually change.
 *
 *   node scripts/cleanup-emdash-prod.mjs --target=prod            # dry-run
 *   node scripts/cleanup-emdash-prod.mjs --target=prod --apply    # write
 */
import { connectDb } from './lib/db.mjs';

const apply = process.argv.includes('--apply');
const targetArg = process.argv.find((a) => a.startsWith('--target='));
const target = targetArg ? targetArg.slice('--target='.length) : 'prod';

const GENERATED_COLS = ['pitch_suggestion', 'suggested_angle', 'reasoning', 'haiku'];

// Same normalization as sanitizeText in session-pipeline.mjs: em-dash → comma,
// then tidy the immediate artifacts. Deliberately does NOT collapse all
// whitespace, so existing formatting is otherwise preserved.
function normalize(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/\s*—\s*/g, ', ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*([,.;:!?])/g, '$1');
}

const db = await connectDb({ target });
try {
  console.log(`Target: ${target}   Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
  const plan = [];
  for (const col of GENERATED_COLS) {
    const rows = (await db.query(
      `SELECT id, ${col} AS val FROM publications WHERE ${col} LIKE '%—%'`
    )).rows;
    let changed = 0;
    const samples = [];
    for (const r of rows) {
      const next = normalize(r.val);
      if (next !== r.val) {
        changed++;
        plan.push({ id: r.id, col, next });
        if (samples.length < 3) samples.push({ before: r.val, after: next });
      }
    }
    console.log(`\n=== ${col}: ${rows.length} rows contain em-dash → ${changed} will change ===`);
    for (const s of samples) {
      console.log(`  BEFORE: …${s.before.slice(0, 110)}…`);
      console.log(`  AFTER : …${s.after.slice(0, 110)}…`);
    }
  }
  console.log(`\nTotal cell updates planned: ${plan.length}`);

  if (!apply) {
    console.log('\nDRY-RUN — nothing written. Re-run with --apply to write.');
  } else {
    await db.query('BEGIN');
    try {
      for (const p of plan) {
        await db.query(
          `UPDATE publications SET ${p.col} = $1, updated_at = NOW() WHERE id = $2`,
          [p.next, p.id]
        );
      }
      await db.query('COMMIT');
      console.log(`\nCOMMITTED ${plan.length} updates on ${target}.`);
      // verify
      for (const col of GENERATED_COLS) {
        const left = (await db.query(`SELECT count(*) c FROM publications WHERE ${col} LIKE '%—%'`)).rows[0].c;
        console.log(`  ${col}: ${left} rows still contain em-dash`);
      }
    } catch (e) {
      await db.query('ROLLBACK');
      console.error('FAILED, rolled back:', e.message);
      process.exitCode = 1;
    }
  }
} finally {
  await db.end();
}
