// Vierter MeisterTask-Pass: Karten-Anhänge (Dateien) in die LOKALE Dev-DB +
// den S3/MinIO-Objektspeicher nachziehen. Die früheren Pässe (Struktur,
// Enrich, Kommentare) liessen Anhänge aus.
//
// Eingabe ALL = mt-attachments-all.json (Browser-Fetch der authentifizierten
// MeisterTask-Downloads, base64-kodiert, via Clipboard exfiltriert):
//   [ { attId, taskId, name, ct, size, created_at, person_id, b64 }, ... ]
// PERSONS = meistertask-export.json (für person_id -> email -> user).
//
// Ablauf je Anhang:
//   - Karte via cards.meistertask_task_id = taskId
//   - Uploader via persons[person_id].email -> users.email (Fallback: Admin)
//   - Bytes nach S3 (putObject-Konvention board/attachments/<cardId>/<id>-<name>)
//   - Zeile in card_attachments
// Idempotent: id + s3_key sind deterministisch aus attId abgeleitet
// (sha1-UUID). Re-Run überschreibt Objekt + Zeile (ON CONFLICT DO UPDATE).
//
// Aufruf:  ALL=scratch/mt-attachments-all.json \
//          PERSONS=~/Dev/Buchhaltung/meistertask-export.json \
//          node scripts/import-meistertask-attachments.mjs

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

loadEnv({ path: '.env.local' });

const ALL = process.env.ALL;
const PERSONS = process.env.PERSONS;
const PG = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres';
if (!ALL || !PERSONS) { console.error('Bitte ALL= und PERSONS= setzen.'); process.exit(1); }

const attachments = JSON.parse(readFileSync(ALL, 'utf8'));
const persons = JSON.parse(readFileSync(PERSONS, 'utf8')).persons || [];
const emailByPerson = new Map(persons.map((p) => [String(p.id), String(p.email || '').toLowerCase()]));

// Deterministische UUID aus einem Namensraum + Wert (sha1, v5-artig genug für
// einen stabilen Primärschlüssel; keine RFC-Kollisionsgarantie nötig).
function stableUuid(seed) {
  const h = createHash('sha1').update('mt-attachment:' + seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
function safeName(name) {
  const base = String(name).split(/[\\/]/).pop() ?? 'datei';
  return base.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'datei';
}
function displayName(name) {
  const base = (String(name).split(/[\\/]/).pop() ?? '').trim();
  return base.slice(0, 160) || 'datei';
}

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'us-east-1',
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') !== 'false',
});
const BUCKET = process.env.S3_BUCKET;

const c = new pg.Client({ connectionString: PG });
await c.connect();

const { rows: cardRows } = await c.query(
  'select id, meistertask_task_id from cards where meistertask_task_id is not null',
);
const cardByMt = new Map(cardRows.map((r) => [String(r.meistertask_task_id), r.id]));
const { rows: userRows } = await c.query('select id, lower(email) as email, role from public.users');
const userByEmail = new Map(userRows.map((r) => [r.email, r.id]));
const adminId = (userRows.find((r) => r.role === 'admin') || userRows[0])?.id;

let inserted = 0, missingCard = 0, fallbackUploader = 0;
for (const a of attachments) {
  const cardId = cardByMt.get(String(a.taskId));
  if (!cardId) { missingCard++; console.warn('  kein Karten-Mapping für taskId', a.taskId, a.name); continue; }
  const email = emailByPerson.get(String(a.person_id)) || '';
  let uploadedBy = userByEmail.get(email);
  if (!uploadedBy) { uploadedBy = adminId; fallbackUploader++; }

  const bytes = Buffer.from(a.b64, 'base64');
  if (bytes.length !== a.size) { console.warn('  Größe weicht ab, überspringe', a.name); continue; }

  const id = stableUuid(a.attId);
  const s3Key = `board/attachments/${cardId}/${id}-${safeName(a.name)}`;
  const contentType = String(a.ct || 'application/octet-stream').split(';')[0].trim().toLowerCase();

  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: s3Key, Body: bytes, ContentType: contentType }));

  await c.query(
    `insert into card_attachments (id, card_id, filename, s3_key, content_type, size_bytes, uploaded_by, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (id) do update set
       card_id=excluded.card_id, filename=excluded.filename, s3_key=excluded.s3_key,
       content_type=excluded.content_type, size_bytes=excluded.size_bytes,
       uploaded_by=excluded.uploaded_by, created_at=excluded.created_at`,
    [id, cardId, displayName(a.name), s3Key, contentType, bytes.length, uploadedBy, a.created_at || new Date().toISOString()],
  );
  inserted++;
}

await c.end();
console.log(`DONE attachments=${inserted} missingCards=${missingCard} fallbackUploader=${fallbackUploader}`);
