// Shared DB-connection helper for scripts/*.
//
// Usage:
//   const db = await connectDb({ target: 'local' | 'prod' });
//   ...
//   await db.end();

import pg from 'pg';
import { readFileSync } from 'fs';

const { Client } = pg;

const LOCAL_URL = 'postgres://postgres:postgres@127.0.0.1:54422/postgres';
const PROD_CRED_PATH = `${process.env.HOME}/.config/oeaw-press-release/prod-credentials`;

export function loadDbUrl(target = 'local') {
  if (target === 'prod') {
    const cred = readFileSync(PROD_CRED_PATH, 'utf-8');
    const m = cred.match(/^PROD_DB_URL_POOLER=(.+)$/m);
    if (!m) throw new Error(`PROD_DB_URL_POOLER not found in ${PROD_CRED_PATH}`);
    return m[1].trim();
  }
  return LOCAL_URL;
}

export async function connectDb({ target = 'local' } = {}) {
  const client = new Client({ connectionString: loadDbUrl(target) });
  await client.connect();
  return client;
}

/** Parse common --target=local|prod, --reset, --promote flags. */
export function parseScriptArgs() {
  const args = process.argv.slice(2);
  return {
    target: args.includes('--target=prod') ? 'prod' : 'local',
    reset: args.includes('--reset'),
    promote: args.includes('--promote'),
    onlyPdf: args.includes('--only-pdf'),
    flags: args,
  };
}

/** Redact the password in DATABASE_URL for safe logging. Reads the live
 *  process.env.DATABASE_URL, which scripts set from loadDbUrl() before they
 *  log or prompt. */
export function redactedDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) return '(DATABASE_URL not set)';
  return url.replace(/:[^@/]+@/, ':***@');
}

/** Interactive guard before a prod write. No-op for the local target or when
 *  --yes is passed (CI/unattended). Otherwise prints the redacted prod target
 *  and waits for y/yes on stdin, exiting(1) on anything else.
 *  @param {{ isProd: boolean, flags: string[], label: string }} opts
 *    `label` is the script tag shown in brackets, e.g. 'sync-events'. */
export async function confirmProd({ isProd, flags, label }) {
  if (!isProd || flags.includes('--yes')) return;
  process.stdout.write(
    `[${label}] PROD target: ${redactedDatabaseUrl()}\nProceed? [y/N] `,
  );
  const answer = await new Promise((resolve) => {
    process.stdin.once('data', (d) => resolve(d.toString().trim().toLowerCase()));
  });
  if (answer !== 'y' && answer !== 'yes') {
    console.error(`[${label}] Aborted.`);
    process.exit(1);
  }
}
