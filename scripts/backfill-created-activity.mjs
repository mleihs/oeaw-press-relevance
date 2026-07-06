// Synthetische „hat die Karte angelegt"-Aktivität für Karten ohne
// Erstellungs-Eintrag nachziehen (MT-Import + Karten aus der Zeit vor dem
// Activity-Log). cards.created_by wurde beim MeisterTask-Import korrekt
// attribuiert; cards.created_at trug dagegen die IMPORT-Zeit — darum zieht
// Schritt 1 die echten MT-Erstellzeiten aus dem Browser-Export nach
// (cards.meistertask_task_id -> active_tasks[].created_at), bevor Schritt 2
// die Activity aus der Karte synthetisiert.
//
// Idempotent: UPDATE nur bei Abweichung, INSERT nur wo noch kein
// created-Verb existiert; payload.backfilled markiert synthetische Zeilen.
// card_activity ist append-only (Trigger blockt UPDATE/DELETE) — INSERT mit
// explizitem created_at ist erlaubt und sortiert im Strang korrekt ein.
//
// Aufruf: node scripts/backfill-created-activity.mjs              (lokal)
//         DATABASE_URL=… node scripts/backfill-created-activity.mjs (prod)
//   MT_EXPORT=…/meistertask-export.json  überschreibt den Dump-Pfad;
//   fehlt die Datei, wird Schritt 1 übersprungen (z. B. auf fremder Maschine).

import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';

const PG = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres';
const MT_EXPORT =
  process.env.MT_EXPORT || `${process.env.HOME}/Dev/Buchhaltung/meistertask-export.json`;

const client = new pg.Client({ connectionString: PG });
await client.connect();

// Schritt 1: echte MT-Erstellzeiten auf die Karten schreiben.
if (existsSync(MT_EXPORT)) {
  const dump = JSON.parse(readFileSync(MT_EXPORT, 'utf8'));
  const byTask = new Map();
  for (const project of Object.values(dump.projects ?? {})) {
    for (const task of project.active_tasks ?? []) {
      if (task.id && task.created_at) byTask.set(String(task.id), task.created_at);
    }
  }
  let fixed = 0;
  for (const [mtId, createdAt] of byTask) {
    const { rowCount } = await client.query(
      `UPDATE cards SET created_at = $2
       WHERE meistertask_task_id = $1 AND created_at <> $2::timestamptz`,
      [mtId, createdAt],
    );
    fixed += rowCount;
  }
  console.log(`MT-Erstellzeiten korrigiert: ${fixed} Karten (Dump: ${byTask.size} Tasks)`);
} else {
  console.log(`Kein MT-Export unter ${MT_EXPORT} — Zeitstempel-Schritt übersprungen.`);
}

// Schritt 2: fehlende created-Activity aus der Karte synthetisieren.
const { rowCount } = await client.query(`
  INSERT INTO card_activity (card_id, actor_id, verb, payload, created_at)
  SELECT c.id, c.created_by, 'created', '{"backfilled": true}'::jsonb, c.created_at
  FROM cards c
  WHERE NOT EXISTS (
    SELECT 1 FROM card_activity a
    WHERE a.card_id = c.id
      AND a.verb IN ('created', 'created_from_subtask', 'created_from_triage')
  )
`);
console.log(`created-Activity nachgetragen: ${rowCount} Karten`);

await client.end();
