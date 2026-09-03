#!/usr/bin/env node
// Schema-drift guard. lib/server/db/schema/*.ts is hand-mirrored per domain
// from the raw-SQL Supabase migrations (NOT db:introspect — it renames existing
// relations). That manual mirror is one-sided: adding a table in a migration but
// forgetting it in the schema dir compiles fine and only fails at runtime. This
// check fails CI if any table created by a migration (and not later dropped,
// and not a view) is missing its pgTable() in lib/server/db/schema/*.ts.
//
// Zweiter Guard (Architektur-Audit #7): Views. lib/server/** referenziert
// Views per String-Literal (raw SQL / pgView) — wird eine View in einer
// späteren Migration gedroppt, kompiliert die Referenz weiter und fällt erst
// zur Laufzeit um. Der Check verfolgt CREATE/DROP VIEW in Migrations-
// Reihenfolge und schlägt fehl, wenn lib/server/** eine View referenziert,
// deren letzter Migrations-Stand DROP ist. (Views, die nie in einer
// Migration vorkamen, kann die Heuristik nicht kennen — die knallen ohnehin
// sofort in jedem Test gegen die DB.)
//
// Heuristic by design — it matches CREATE TABLE / DROP TABLE / CREATE [MAT.]
// VIEW / DROP [MAT.] VIEW by name (SQL `--`-Kommentare werden vorher
// entfernt, sonst matchen Prosa-Sätze wie "CREATE OR REPLACE VIEW cannot
// drop columns"). Tune the regexes here if a future migration uses a shape
// it doesn't recognize.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'supabase', 'migrations');
const schemaDir = join(root, 'lib', 'server', 'db', 'schema');

const name = '(?:"?public"?\\.)?"?([a-z_0-9]+)"?';
const reCreateTable = new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${name}`, 'gi');
const reDropTable = new RegExp(`drop\\s+table\\s+(?:if\\s+exists\\s+)?${name}`, 'gi');
const reCreateView = new RegExp(`create\\s+(?:or\\s+replace\\s+)?(?:materialized\\s+)?view\\s+(?:if\\s+not\\s+exists\\s+)?${name}`, 'gi');
const reDropView = new RegExp(`drop\\s+(?:materialized\\s+)?view\\s+(?:if\\s+exists\\s+)?${name}`, 'gi');

const created = new Set();
const dropped = new Set();
const views = new Set();
// name → 'live' | 'dropped': letzter CREATE/DROP-VIEW-Stand in Migrations-
// Reihenfolge (Dateiname sortiert = chronologisch, innerhalb einer Datei
// nach Statement-Position — DROP + CREATE in derselben Migration ist das
// übliche Spaltenlisten-Änderungsmuster und muss als 'live' enden).
const viewState = new Map();

for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
  // `--`-Zeilenkommentare raus: Migrations-Prosa erwähnt CREATE/DROP VIEW
  // regelmäßig in Erklärtexten und würde sonst Phantom-Namen erzeugen.
  const sql = readFileSync(join(migrationsDir, file), 'utf8').replace(/--[^\n]*/g, '');
  for (const m of sql.matchAll(reCreateTable)) created.add(m[1].toLowerCase());
  for (const m of sql.matchAll(reDropTable)) dropped.add(m[1].toLowerCase());
  for (const m of sql.matchAll(reCreateView)) views.add(m[1].toLowerCase());

  const events = [];
  for (const m of sql.matchAll(reCreateView)) events.push({ at: m.index, name: m[1].toLowerCase(), state: 'live' });
  for (const m of sql.matchAll(reDropView)) events.push({ at: m.index, name: m[1].toLowerCase(), state: 'dropped' });
  events.sort((a, b) => a.at - b.at);
  for (const e of events) viewState.set(e.name, e.state);
}

const schema = readdirSync(schemaDir)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => readFileSync(join(schemaDir, f), 'utf8'))
  .join('\n');
const inSchema = new Set(
  [...schema.matchAll(/pgTable\(\s*["']([a-z_0-9]+)["']/gi)].map((m) => m[1].toLowerCase()),
);

const missing = [...created].filter((t) => !dropped.has(t) && !views.has(t) && !inSchema.has(t)).sort();

// ---- View-Drift: lib/server/** darf keine gedroppte View referenzieren ----
// "Dead" = letzter Migrations-Stand ist DROP und der Name lebt auch nicht als
// Tabelle weiter (Rename-Muster View→Tabelle).
const deadViews = [...viewState.entries()]
  .filter(([n, state]) => state === 'dropped' && !(created.has(n) && !dropped.has(n)))
  .map(([n]) => n)
  .sort();

function* walkTs(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkTs(p);
    else if (/\.tsx?$/.test(entry.name)) yield p;
  }
}

const deadRefs = []; // { view, file }
if (deadViews.length > 0) {
  const serverDir = join(root, 'lib', 'server');
  for (const file of walkTs(serverDir)) {
    // Kommentare raus (Block + Zeile), damit Prosa/Historie nicht zählt.
    // `[^:]//` schont URLs (`https://…`) in String-Literalen.
    const code = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    for (const view of deadViews) {
      if (new RegExp(`\\b${view}\\b`).test(code)) deadRefs.push({ view, file });
    }
  }
}

if (missing.length > 0) {
  console.error('Schema drift: tables created by migrations but missing pgTable() in lib/server/db/schema/*.ts:');
  for (const t of missing) console.error(`  - ${t}`);
  console.error('\nAdd them to the matching domain file manually (do NOT run db:introspect — it renames existing relations).');
}

if (deadRefs.length > 0) {
  console.error('View drift: lib/server/** references views whose latest migration state is DROP:');
  for (const { view, file } of deadRefs) console.error(`  - ${view} (referenced in ${file})`);
  console.error('\nRe-create the view in a migration or update the referencing code.');
}

if (missing.length > 0 || deadRefs.length > 0) process.exit(1);

const liveViews = [...viewState.values()].filter((s) => s === 'live').length;
console.log(`Schema-drift check OK: ${inSchema.size} tables in schema/*.ts cover all ${created.size - dropped.size} live migration tables; ${liveViews} live views, no dead-view references in lib/server/**.`);
