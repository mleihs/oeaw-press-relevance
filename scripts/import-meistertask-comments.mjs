// Dritter MeisterTask-Pass: Karten-Kommentare in die LOKALE Dev-DB nachziehen.
//
// Eingabe COMMENTS = meistertask-comments.json (Browser-`copy()`-Export):
//   { com: { "<mtTaskId>": [ { p:<personId>, t:"Text", at:"<iso>" }, ... ] },
//     persons: { "<personId>": "vorname.nachname@oeaw.ac.at" } }
//
// Karte via cards.meistertask_task_id, Autor via persons[personId]→email→user.
// card_comments.author_id ist Pflicht-FK; Kommentare unbekannter Autoren
// werden übersprungen (geloggt). Idempotent: löscht je betroffener Karte
// vorhandene Kommentare und legt sie frisch an. body_html rendert die App
// beim Lesen aus body_md (keine Spalte hier).
//
// Aufruf:  COMMENTS=~/Dev/Buchhaltung/meistertask-comments.json \
//          node scripts/import-meistertask-comments.mjs

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const COMMENTS = process.env.COMMENTS;
const PG = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres';
if (!COMMENTS) { console.error('Bitte COMMENTS= setzen.'); process.exit(1); }

const data = JSON.parse(readFileSync(COMMENTS, 'utf8'));
const com = data.com || {};
const persons = data.persons || {};

const c = new pg.Client({ connectionString: PG });
await c.connect();

// email(lower) -> user.id
const { rows: userRows } = await c.query('select id, lower(email) as email from public.users');
const userByEmail = new Map(userRows.map((r) => [r.email, r.id]));
// mtTaskId -> card.id
const { rows: cardRows } = await c.query('select id, meistertask_task_id from cards where meistertask_task_id is not null');
const cardByMt = new Map(cardRows.map((r) => [String(r.meistertask_task_id), r.id]));

await c.query('BEGIN');
try {
  let inserted = 0, skippedAuthor = 0, missingCard = 0;
  for (const [mtTaskId, list] of Object.entries(com)) {
    const cardId = cardByMt.get(String(mtTaskId));
    if (!cardId) { missingCard++; continue; }
    await c.query('delete from card_comments where card_id=$1', [cardId]);
    // chronologisch einfügen (created_at bestimmt die Reihenfolge im Strang)
    const sorted = [...list].sort((a, b) => String(a.at).localeCompare(String(b.at)));
    for (const cm of sorted) {
      const email = String(persons[cm.p] || '').toLowerCase();
      const authorId = userByEmail.get(email);
      if (!authorId) { skippedAuthor++; continue; }
      const body = String(cm.t || '').trim();
      if (!body) continue;
      await c.query(
        'insert into card_comments(id,card_id,author_id,body_md,created_at) values($1,$2,$3,$4,$5)',
        [randomUUID(), cardId, authorId, body, cm.at || new Date().toISOString()],
      );
      inserted++;
    }
  }
  await c.query('COMMIT');
  console.log(`DONE comments=${inserted} skippedUnknownAuthor=${skippedAuthor} missingCards=${missingCard}`);
} catch (e) {
  await c.query('ROLLBACK');
  throw e;
} finally {
  await c.end();
}
