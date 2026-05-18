#!/usr/bin/env tsx
/**
 * WebDB -> Postgres ETL, v2 (ADR 0017). Drizzle SourceAdapter + shared
 * loader port of scripts/webdb-import.mjs. Same observable DB end-state;
 * the legacy .mjs stays the operational path until the parity gate proves
 * equivalence (scripts/parity-gate.ts).
 *
 * Usage (defaults match the local stack):
 *   npm run webdb-import:v2
 *
 * Env: MYSQL_HOST/PORT/USER/PASSWORD/DATABASE, PG_DATABASE_URL, BATCH_SIZE.
 *
 * SAFETY (production_db_safety): refuses any non-127.0.0.1 PG host. Local
 * is canonical; never point this at prod. The escape hatch
 * (WEBDB_IMPORT_ALLOW_REMOTE=1) exists only for a deliberate, supervised
 * cutover and prints a loud banner.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/lib/server/db/schema';
import * as relations from '@/lib/server/db/relations';
import { runIngest } from '@/lib/server/ingest';
import { WebdbAdapter } from '@/lib/server/ingest/adapters/webdb';
// Shared single-source DOI extractor (scripts -> scripts; same module the
// legacy ETL + session-pipeline doi-backfill use — zero drift).
import { extractDoiFromRow } from './lib/doi-extract.mjs';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const DEFAULT_LOCAL_URL =
  'postgresql://postgres:postgres@127.0.0.1:54422/postgres';

function resolvePgUrl(): string {
  const url = process.env.PG_DATABASE_URL || DEFAULT_LOCAL_URL;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`PG_DATABASE_URL is not a valid URL: ${url}`);
  }
  const allowRemote = process.env.WEBDB_IMPORT_ALLOW_REMOTE === '1';
  if (!LOCAL_HOSTS.has(host)) {
    if (!allowRemote) {
      throw new Error(
        `REFUSING to run ETL against non-local host "${host}". Local is `
        + 'canonical (production_db_safety). If this is a deliberate, '
        + 'backed-up, parity-proven cutover, set WEBDB_IMPORT_ALLOW_REMOTE=1.',
      );
    }
    console.warn(
      '\n!!! WEBDB_IMPORT_ALLOW_REMOTE=1 — writing to a NON-LOCAL host '
      + `("${host}"). This is destructive to analysis state if the parity\n`
      + '!!! gate has not passed. Ctrl-C now unless you know exactly why.\n',
    );
  }
  return url;
}

async function main() {
  console.log(
    '[webdb-import-v2] ADR 0017 port. UNPROVEN until scripts/parity-gate.ts '
    + 'clears it vs the legacy .mjs on the local canonical DB.',
  );
  const pgUrl = resolvePgUrl();
  const client = postgres(pgUrl, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  const db = drizzle(client, { schema: { ...schema, ...relations } });

  try {
    const adapter = new WebdbAdapter({ extractDoiFromRow });
    console.log(`[webdb-import-v2] fetching from source "${adapter.name}"...`);
    const raw = await adapter.fetch();
    const batch = adapter.normalize(raw);
    console.log(
      `[webdb-import-v2] normalized: ${batch.publications.length} pubs, `
      + `${batch.persons.length} persons, ${batch.orgunits.length} orgunits`,
    );
    // promoteSource kept as 'webdb-import' for byte-identical
    // press_release_promote_log provenance with the legacy path.
    await runIngest(db, batch, { promoteSource: 'webdb-import' });
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
