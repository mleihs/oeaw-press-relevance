// Zweiter MeisterTask-Pass: Per-Karten-Checklisten + Label-Zuweisungen in die
// LOKALE Dev-DB nachziehen. Ergänzt den Struktur-Import (Boards/Spalten/Karten).
//
// Eingaben:
//   ENRICH = meistertask-enrich.json  (Browser-Export, Minimal-Format:
//            { "<mtTaskId>": { l:[mtLabelId,...], c:[["Item-Text",status],...] } })
//   MAP    = mt-label-map.json         (vom Label-Definitions-Import:
//            { "<mtLabelId>": "<board_labels.id>" })
//
// Karten werden über cards.meistertask_task_id = <mtTaskId> gefunden.
// Idempotent: löscht je betroffener Karte vorhandene 'checklist'-Items +
// card_labels und legt sie frisch an.
//
// Aufruf (aus dem Projektverzeichnis):
//   ENRICH=~/Dev/Buchhaltung/meistertask-enrich.json \
//   MAP=<scratchpad>/mt-label-map.json \
//   node scripts/import-meistertask-enrich.mjs

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const ENRICH = process.env.ENRICH;
const MAP = process.env.MAP;
const PG = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres';
if (!ENRICH || !MAP) {
  console.error('Bitte ENRICH= und MAP= setzen.');
  process.exit(1);
}

const BASE = 26, LAST = BASE - 1;
function initialRanks(count) {
  if (count === 0) return [];
  let length = 1, capacity = LAST;
  while (capacity < count + 1) { length++; capacity *= BASE; }
  const out = [];
  for (let i = 0; i < count; i++) {
    let v = Math.floor(((i + 1) * capacity) / (count + 1));
    let key = String.fromCharCode(97 + 1 + (v % LAST));
    v = Math.floor(v / LAST);
    for (let d = 1; d < length; d++) { key = String.fromCharCode(97 + (v % BASE)) + key; v = Math.floor(v / BASE); }
    out.push(key);
  }
  return out;
}

const enrich = JSON.parse(readFileSync(ENRICH, 'utf8'));
const labelMap = JSON.parse(readFileSync(MAP, 'utf8'));

const c = new pg.Client({ connectionString: PG });
await c.connect();

// mtTaskId -> card row
const { rows: cardRows } = await c.query(
  "select id, meistertask_task_id from cards where meistertask_task_id is not null",
);
const cardByMt = new Map(cardRows.map((r) => [String(r.meistertask_task_id), r.id]));

await c.query('BEGIN');
try {
  let items = 0, assigns = 0, missing = 0;
  for (const [mtTaskId, e] of Object.entries(enrich)) {
    const cardId = cardByMt.get(String(mtTaskId));
    if (!cardId) { missing++; continue; }

    // Checklisten-Items neu aufbauen.
    if (Array.isArray(e.c) && e.c.length) {
      await c.query("delete from card_items where card_id=$1 and kind='checklist'", [cardId]);
      const ranks = initialRanks(e.c.length);
      for (let i = 0; i < e.c.length; i++) {
        const [name, status] = e.c[i];
        const done = status === 2;
        await c.query(
          "insert into card_items(id,card_id,kind,text,rank,done_at) values($1,$2,'checklist',$3,$4,$5)",
          [randomUUID(), cardId, String(name).slice(0, 2000) || '(leer)', ranks[i], done ? new Date().toISOString() : null],
        );
        items++;
      }
    }

    // Label-Zuweisungen neu setzen.
    if (Array.isArray(e.l) && e.l.length) {
      await c.query('delete from card_labels where card_id=$1', [cardId]);
      for (const mtLabelId of e.l) {
        const labelId = labelMap[String(mtLabelId)];
        if (!labelId) continue;
        await c.query('insert into card_labels(card_id,label_id) values($1,$2) on conflict do nothing', [cardId, labelId]);
        assigns++;
      }
    }
  }
  await c.query('COMMIT');
  console.log(`DONE checklistItems=${items} labelAssignments=${assigns} missingCards=${missing}`);
} catch (err) {
  await c.query('ROLLBACK');
  throw err;
} finally {
  await c.end();
}
