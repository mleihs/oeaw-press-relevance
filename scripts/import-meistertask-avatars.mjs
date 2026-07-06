// MeisterTask-Profilbilder übernehmen: lädt die Avatare der übernommenen
// ÖAW-Accounts (Browser-Export der MT-GraphQL persons-Query) herunter, legt
// sie im Projekt-Bucket unter avatars/<user_id>.<ext> ab und setzt
// users.avatar_key. Idempotent (Objekt + Spalte werden überschrieben).
//
// Eingabe: PERSONS = JSON-Array [{ email, avatar_thumb }, ...]
//   (avatar_thumb = mindmeister.com /medium/-URL; das Script versucht
//    zuerst die /original/-Variante, fällt auf /medium/ zurück.)
//
// Env: DATABASE_URL (Ziel-DB, local oder prod-Pooler) + S3_* (Bucket ist für
// beide Deployments derselbe MinIO — einmal hochladen reicht, avatar_key
// muss aber je DB gesetzt werden).
//
// Aufruf:
//   set -a; source .env.local; set +a
//   PERSONS=<scratchpad>/mt-persons.json node scripts/import-meistertask-avatars.mjs

import { readFileSync } from 'node:fs';
import pg from 'pg';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const PERSONS = process.env.PERSONS;
if (!PERSONS) {
  console.error('Bitte PERSONS=<pfad zu mt-persons.json> setzen.');
  process.exit(1);
}
const persons = JSON.parse(readFileSync(PERSONS, 'utf8'));

const { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET } = process.env;
if (!S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !S3_BUCKET) {
  console.error('S3_* Env fehlt (Endpoint/Key/Secret/Bucket).');
  process.exit(1);
}
const s3 = new S3Client({
  endpoint: S3_ENDPOINT,
  region: process.env.S3_REGION || 'us-east-1',
  credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
  forcePathStyle: true,
});

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

let stored = 0, skipped = 0;
for (const p of persons) {
  const email = String(p.email || '').toLowerCase();
  if (!p.avatar_thumb) { console.log(`- ${email}: kein Avatar in MeisterTask`); skipped++; continue; }

  const { rows } = await db.query('select id from users where lower(email) = $1', [email]);
  if (!rows.length) { console.log(`- ${email}: kein User in der DB`); skipped++; continue; }
  const userId = rows[0].id;

  // Original bevorzugen, medium als Fallback.
  const candidates = [p.avatar_thumb.replace('/medium/', '/original/'), p.avatar_thumb];
  let res = null;
  for (const url of candidates) {
    const r = await fetch(url);
    if (r.ok) { res = r; break; }
  }
  if (!res) { console.log(`- ${email}: Download fehlgeschlagen`); skipped++; continue; }

  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const bytes = new Uint8Array(await res.arrayBuffer());
  const key = `avatars/${userId}.${ext}`;

  await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: bytes, ContentType: contentType }));
  await db.query('update users set avatar_key = $1, updated_at = now() where id = $2', [key, userId]);
  console.log(`✓ ${email} → ${key} (${bytes.length} B, ${contentType})`);
  stored++;
}

await db.end();
console.log(`\nFertig: ${stored} gespeichert, ${skipped} übersprungen.`);
