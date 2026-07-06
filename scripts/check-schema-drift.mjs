#!/usr/bin/env node
// Schema-drift guard. lib/server/db/schema/*.ts is hand-mirrored per domain
// from the raw-SQL Supabase migrations (NOT db:introspect — it renames existing
// relations). That manual mirror is one-sided: adding a table in a migration but
// forgetting it in the schema dir compiles fine and only fails at runtime. This
// check fails CI if any table created by a migration (and not later dropped,
// and not a view) is missing its pgTable() in lib/server/db/schema/*.ts.
//
// Heuristic by design — it matches CREATE TABLE / DROP TABLE / CREATE [MAT.]
// VIEW by name. Tune the regexes here if a future migration uses a shape it
// doesn't recognize.

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

const created = new Set();
const dropped = new Set();
const views = new Set();

for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))) {
  const sql = readFileSync(join(migrationsDir, file), 'utf8');
  for (const m of sql.matchAll(reCreateTable)) created.add(m[1].toLowerCase());
  for (const m of sql.matchAll(reDropTable)) dropped.add(m[1].toLowerCase());
  for (const m of sql.matchAll(reCreateView)) views.add(m[1].toLowerCase());
}

const schema = readdirSync(schemaDir)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => readFileSync(join(schemaDir, f), 'utf8'))
  .join('\n');
const inSchema = new Set(
  [...schema.matchAll(/pgTable\(\s*["']([a-z_0-9]+)["']/gi)].map((m) => m[1].toLowerCase()),
);

const missing = [...created].filter((t) => !dropped.has(t) && !views.has(t) && !inSchema.has(t)).sort();

if (missing.length > 0) {
  console.error('Schema drift: tables created by migrations but missing pgTable() in lib/server/db/schema/*.ts:');
  for (const t of missing) console.error(`  - ${t}`);
  console.error('\nAdd them to the matching domain file manually (do NOT run db:introspect — it renames existing relations).');
  process.exit(1);
}

console.log(`Schema-drift check OK: ${inSchema.size} tables in schema/*.ts cover all ${created.size - dropped.size} live migration tables.`);
