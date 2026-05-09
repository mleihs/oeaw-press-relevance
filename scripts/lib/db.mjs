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
