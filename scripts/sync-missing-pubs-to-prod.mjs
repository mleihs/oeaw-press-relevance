#!/usr/bin/env node
/**
 * PHASE 7 — full publication-row sync (local → prod) for the publications that
 * exist LOCALLY but are absent from prod (brand-new rows from the latest WebDB
 * re-import). The analysis-push script (push-analysis-to-prod.mjs) only UPDATEs
 * existing prod rows; these rows do not exist yet, so they need INSERTs.
 *
 * Copies, in ONE prod transaction, with ON CONFLICT DO NOTHING (idempotent):
 *   1. publications        (the missing rows, all columns)
 *   2. orgunit_publications, person_publications, publication_projects
 *      (their relation/join rows — FKs to orgunits/persons/projects, which are
 *       asserted to already exist in prod; the script aborts if any are missing)
 *
 * Embeddings are NOT synced (the missing set carries none; press-similarity is a
 * separate concern). Existing prod rows' metadata is NOT touched — this only
 * INSERTs absent rows, it never UPDATEs, so prod-side state cannot be clobbered.
 *
 * DRY-RUN by default (rolls back). Pass --apply to COMMIT.
 *   node scripts/sync-missing-pubs-to-prod.mjs            # dry-run
 *   node scripts/sync-missing-pubs-to-prod.mjs --apply    # write
 */
import { connectDb } from './lib/db.mjs';

const apply = process.argv.includes('--apply');
const CHUNK = 2000;

const L = await connectDb({ target: 'local' });
const P = await connectDb({ target: 'prod' });

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// 1. Determine which local publications are absent from prod.
const allLocalIds = (await L.query('SELECT id FROM publications')).rows.map((r) => r.id);
const missing = [];
for (const c of chunk(allLocalIds, CHUNK)) {
  const present = new Set(
    (await P.query('SELECT id FROM publications WHERE id = ANY($1::uuid[])', [c])).rows.map((r) => r.id)
  );
  missing.push(...c.filter((id) => !present.has(id)));
}
console.log(`Local publications absent from prod: ${missing.length}`);
if (missing.length === 0) {
  console.log('Nothing to sync. Prod is in sync with local for publication rows.');
  await L.end(); await P.end();
  process.exit(0);
}

// 2. Pre-flight: every referenced parent (orgunit/person/project) must exist in prod.
async function distinctRef(table, col) {
  return (await L.query(
    `SELECT DISTINCT ${col} AS id FROM ${table} WHERE publication_id = ANY($1::uuid[]) AND ${col} IS NOT NULL`,
    [missing]
  )).rows.map((r) => r.id);
}
async function missingParents(prodTable, ids) {
  if (!ids.length) return [];
  const present = new Set();
  for (const c of chunk(ids, CHUNK)) {
    (await P.query(`SELECT id FROM ${prodTable} WHERE id = ANY($1::uuid[])`, [c])).rows.forEach((r) => present.add(r.id));
  }
  return ids.filter((id) => !present.has(id));
}
const refOrg = await distinctRef('orgunit_publications', 'orgunit_id');
const refPer = await distinctRef('person_publications', 'person_id');
const refPrj = await distinctRef('publication_projects', 'project_id');
const missOrg = await missingParents('orgunits', refOrg);
const missPer = await missingParents('persons', refPer);
const missPrj = await missingParents('projects', refPrj);
console.log(`Parent pre-flight — orgunits missing:${missOrg.length} persons missing:${missPer.length} projects missing:${missPrj.length}`);
if (missOrg.length || missPer.length || missPrj.length) {
  console.error('ABORT: referenced parent rows are missing in prod. They must be synced first.');
  console.error('  orgunits:', missOrg.slice(0, 10));
  console.error('  persons :', missPer.slice(0, 10));
  console.error('  projects:', missPrj.slice(0, 10));
  await L.end(); await P.end();
  process.exit(1);
}

// 3. Generic local→prod row copier (ON CONFLICT DO NOTHING).
async function copyRows(table, filterCol, ids) {
  let attempted = 0, inserted = 0;
  for (const c of chunk(ids, CHUNK)) {
    const res = await L.query(`SELECT * FROM ${table} WHERE ${filterCol} = ANY($1::uuid[])`, [c]);
    const cols = res.fields.map((f) => f.name);
    const colList = cols.map((x) => `"${x}"`).join(', ');
    for (const row of res.rows) {
      attempted++;
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const values = cols.map((x) => row[x]);
      const r = await P.query(
        `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        values
      );
      inserted += r.rowCount;
    }
  }
  return { attempted, inserted };
}

// 4. Single transaction: parent (publications) first, then join tables.
await P.query('BEGIN');
try {
  const pubs = await copyRows('publications', 'id', missing);
  const ou = await copyRows('orgunit_publications', 'publication_id', missing);
  const pp = await copyRows('person_publications', 'publication_id', missing);
  const prj = await copyRows('publication_projects', 'publication_id', missing);

  console.log('\nInsert results (attempted → inserted, ON CONFLICT DO NOTHING):');
  console.log(`  publications        : ${pubs.attempted} → ${pubs.inserted}`);
  console.log(`  orgunit_publications: ${ou.attempted} → ${ou.inserted}`);
  console.log(`  person_publications : ${pp.attempted} → ${pp.inserted}`);
  console.log(`  publication_projects: ${prj.attempted} → ${prj.inserted}`);

  // In-transaction verification.
  const check = (await P.query(
    `SELECT count(*) present, count(*) FILTER (WHERE press_score IS NOT NULL) scored
     FROM publications WHERE id = ANY($1::uuid[])`, [missing]
  )).rows[0];
  console.log(`  verify in-tx: of ${missing.length} target ids → present=${check.present} scored=${check.scored}`);

  if (apply) {
    await P.query('COMMIT');
    console.log('\nCOMMITTED.');
  } else {
    await P.query('ROLLBACK');
    console.log('\nDRY-RUN rolled back. Re-run with --apply to write.');
  }
} catch (e) {
  await P.query('ROLLBACK');
  console.error('FAILED, rolled back:', e.message);
  await L.end(); await P.end();
  process.exit(1);
}

await L.end();
await P.end();
