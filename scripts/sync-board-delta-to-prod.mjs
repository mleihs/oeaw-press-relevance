// Board-Delta lokal → prod nachziehen (additiver Merge, KEIN Replace).
//
// Kontext: Das selbstgehostete Prod (db-oeaw.metaspots.net) entstand am
// 2026-07-06 mittags als Snapshot der lokalen Dev-DB — inklusive des
// MeisterTask-Imports und mit IDENTISCHEN User-/Karten-IDs. Alles, was lokal
// danach nachgezogen wurde, fehlt auf prod:
//   1. card_attachments (MT-Anhänge, Bytes liegen schon im geteilten MinIO)
//   2. card_activity (backfill-created-activity.mjs: synthetische
//      „created"-Historie + reparierte cards.created_at aus dem MT-Dump)
//   3. cards.created_at-Reparatur (nur diese Spalte; prod-Karten können
//      inzwischen organisch bewegt/archiviert sein — nichts anderes anfassen)
//
// Bewusst NICHT synchronisiert: card_references/external_objects (lokale
// Test-Referenzen; prod hat eigene, organisch angelegte), Karteninhalte,
// Kommentare (identisch), User/Avatare (bereits auf prod).
//
// Idempotent: Inserts mit ON CONFLICT DO NOTHING, Update nur bei Abweichung.
//
// Aufruf:  node scripts/sync-board-delta-to-prod.mjs --dry-run | --apply

import { connectDb } from './lib/db.mjs';

const APPLY = process.argv.includes('--apply');
if (!APPLY && !process.argv.includes('--dry-run')) {
  console.error('Bitte --dry-run oder --apply angeben.');
  process.exit(1);
}

const local = await connectDb({ target: 'local' });
const prod = await connectDb({ target: 'prod' });

// Guard: prod muss der Snapshot-Zwilling sein (gleiche Karten-IDs), sonst
// wäre der additive Merge sinnlos/gefährlich.
const [lc, pc] = await Promise.all([
  local.query('SELECT count(*)::int n FROM cards'),
  prod.query('SELECT count(*)::int n FROM cards'),
]);
const shared = await prod.query(
  'SELECT count(*)::int n FROM cards WHERE id = ANY($1)',
  [(await local.query('SELECT array_agg(id) a FROM cards')).rows[0].a],
);
console.log(`cards lokal=${lc.rows[0].n} prod=${pc.rows[0].n} gemeinsame IDs=${shared.rows[0].n}`);
if (shared.rows[0].n < Math.min(lc.rows[0].n, pc.rows[0].n) * 0.95) {
  throw new Error('Karten-IDs stimmen nicht überein — falsches Prod-Ziel?');
}

// ---- User-Mapping lokal → prod (per E-Mail) --------------------------------
// Die User-IDs sind ÜBERWIEGEND identisch (Snapshot), aber nicht alle:
// stefan.meisterle wurde auf prod frisch angelegt (neue ID), und
// matthias.leihs@gmail.com existiert auf prod nicht (dort ist die
// @oeaw.ac.at-Identität der Admin). Nicht abbildbare lokale User (Test-
// Accounts) fallen auf den Admin zurück.
const ADMIN_FALLBACK = 'matthias.leihs@oeaw.ac.at';
const localUsers = (await local.query('SELECT id, email FROM users')).rows;
const prodByEmail = new Map(
  (await prod.query('SELECT id, email FROM users')).rows.map((u) => [u.email.toLowerCase(), u.id]),
);
const adminId = prodByEmail.get(ADMIN_FALLBACK);
if (!adminId) throw new Error(`Fallback-User ${ADMIN_FALLBACK} fehlt auf prod.`);
const userMap = new Map();
for (const u of localUsers) {
  let email = u.email.toLowerCase();
  if (email === 'matthias.leihs@gmail.com') email = ADMIN_FALLBACK;
  const pid = prodByEmail.get(email);
  if (pid) userMap.set(u.id, pid);
  else {
    userMap.set(u.id, adminId);
    console.log(`  Hinweis: ${u.email} nicht auf prod → Admin-Fallback`);
  }
}
const mapUser = (id) => (id == null ? null : (userMap.get(id) ?? adminId));

// ---- 1. Anhänge ------------------------------------------------------------
const atts = (await local.query('SELECT * FROM card_attachments')).rows;
let attNew = 0;
for (const a of atts) {
  if (!APPLY) continue;
  const r = await prod.query(
    `INSERT INTO card_attachments (id, card_id, filename, s3_key, content_type, size_bytes, uploaded_by, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
    [a.id, a.card_id, a.filename, a.s3_key, a.content_type, a.size_bytes, mapUser(a.uploaded_by), a.created_at],
  );
  attNew += r.rowCount;
}
console.log(`Anhänge: ${atts.length} lokal${APPLY ? `, ${attNew} neu eingefügt` : ' (dry-run)'}`);

// ---- 2. Aktivitäten (Merge by id) ------------------------------------------
const acts = (await local.query('SELECT * FROM card_activity')).rows;
let actNew = 0;
const mapPayload = (payload) => {
  if (payload == null) return payload;
  let s = JSON.stringify(payload);
  for (const [lid, pid] of userMap) if (lid !== pid) s = s.replaceAll(lid, pid);
  return s;
};
for (const a of acts) {
  if (!APPLY) continue;
  const r = await prod.query(
    `INSERT INTO card_activity (id, card_id, actor_id, verb, payload, created_at)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
    [a.id, a.card_id, mapUser(a.actor_id), a.verb, mapPayload(a.payload), a.created_at],
  );
  actNew += r.rowCount;
}
console.log(`Aktivitäten: ${acts.length} lokal${APPLY ? `, ${actNew} neu eingefügt` : ' (dry-run)'}`);

// ---- 3. created_at-Reparatur für MT-Karten ---------------------------------
const repairs = (
  await local.query('SELECT id, created_at FROM cards WHERE meistertask_task_id IS NOT NULL')
).rows;
let fixed = 0;
for (const c of repairs) {
  if (!APPLY) continue;
  const r = await prod.query('UPDATE cards SET created_at = $2 WHERE id = $1 AND created_at <> $2', [
    c.id,
    c.created_at,
  ]);
  fixed += r.rowCount;
}
console.log(`created_at: ${repairs.length} MT-Karten geprüft${APPLY ? `, ${fixed} korrigiert` : ' (dry-run)'}`);

// ---- Verifikation ----------------------------------------------------------
for (const [t, sql] of [
  ['card_attachments', 'SELECT count(*)::int n FROM card_attachments'],
  ['card_activity', 'SELECT count(*)::int n FROM card_activity'],
  ["activity 'created'", "SELECT count(*)::int n FROM card_activity WHERE verb='created'"],
]) {
  const l = (await local.query(sql)).rows[0].n;
  const p = (await prod.query(sql)).rows[0].n;
  console.log(`stand: ${t} lokal=${l} prod=${p}`);
}

await local.end();
await prod.end();
console.log(APPLY ? 'FERTIG.' : 'Dry-run beendet — nichts geschrieben.');
