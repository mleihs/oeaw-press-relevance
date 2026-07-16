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

// SSH-tunnel target for the prod pooler. `npm run db:tunnel` forwards
// localhost:5433 → VPS-localhost:5432 (Supavisor session pooler).
const TUNNEL_HOST = '127.0.0.1';
const TUNNEL_PORT = '5433';

export function loadDbUrl(target = 'local') {
  if (target === 'prod') {
    // Escape hatch: a fully-formed URL wins over everything (rarely needed).
    if (process.env.PROD_DB_URL_OVERRIDE?.trim()) {
      return process.env.PROD_DB_URL_OVERRIDE.trim();
    }
    const cred = readFileSync(PROD_CRED_PATH, 'utf-8');
    const m = cred.match(/^PROD_DB_URL_POOLER=(.+)$/m);
    if (!m) throw new Error(`PROD_DB_URL_POOLER not found in ${PROD_CRED_PATH}`);
    let url = m[1].trim();

    // PROD_DB_TUNNEL=1 routes through the SSH tunnel — needed from networks
    // where the direct pooler path is blocked (the OeAW office firewall resets
    // the TLS handshake to :5432). We rewrite host:port to the tunnel and force
    // sslmode=require: postgres-js (Drizzle) tolerates the pooler's self-signed
    // cert under `require`, and the node-pg path gets a scoped
    // rejectUnauthorized:false in connectDb() — so NO process-wide
    // NODE_TLS_REJECT_UNAUTHORIZED=0 is ever required.
    if (process.env.PROD_DB_TUNNEL === '1' || process.env.PROD_DB_TUNNEL === 'true') {
      url = url.replace(/@[^/@:]+:\d+\//, `@${TUNNEL_HOST}:${TUNNEL_PORT}/`);
      url = /sslmode=/.test(url)
        ? url.replace(/sslmode=[^&]*/, 'sslmode=require')
        : url + (url.includes('?') ? '&' : '?') + 'sslmode=require';
    }
    return url;
  }
  return LOCAL_URL;
}

export async function connectDb({ target = 'local' } = {}) {
  // Scope the self-signed-cert exception to THIS connection instead of
  // disabling verification for the whole process. The prod pooler presents a
  // self-signed cert; over the SSH tunnel the transport is already
  // authenticated + encrypted, so skipping cert verification here is safe and
  // leaves every other TLS in the process (Sentry, OpenRouter, …) fully
  // verified. node-pg's explicit ssl option wins over the URL's sslmode.
  let connectionString = loadDbUrl(target);
  let ssl;
  if (target === 'prod') {
    ssl = { rejectUnauthorized: false };
    // Strip sslmode from the URL so node-pg doesn't re-derive its ssl config
    // from it and override the explicit `ssl` above. (node-pg reads
    // sslmode=require as "verify the cert" and would fail on the pooler's
    // self-signed cert — postgres-js reads the same token as "encrypt, don't
    // verify", which is why the two libraries need different handling. Our
    // creds carry sslmode as the sole query param.)
    connectionString = connectionString.replace(/[?&]sslmode=[^&]*/gi, '');
  }
  const client = new Client({ connectionString, ssl });
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
