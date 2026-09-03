import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import * as relations from './relations';

/**
 * Drizzle DB client. Use this for SELECT / INSERT / UPDATE / DELETE queries
 * in route business-logic (lib/server/<feature>/*.ts). The Supabase-JS
 * client still handles Auth, Realtime, Storage and RPC calls.
 *
 * RLS: the postgres-js pool connects as service-role (or with whatever
 * account DATABASE_URL specifies), so no automatic RLS. Server code is
 * responsible for any explicit access checks. See OSS_READINESS_PLAN.md
 * §7.7.
 *
 * DATABASE_URL expectations
 * -------------------------
 * - Production (Vercel): the Supavisor *transaction-mode* pooler URL
 *   (`postgresql://postgres.PROJECT:PASSWORD@aws-X.pooler.supabase.com:6543/postgres`).
 *   The direct Postgres port 5432 burns through Supabase's connection
 *   budget when many Lambda instances spin up.
 * - Local dev: the Supabase-CLI Docker direct URL
 *   (`postgresql://postgres:postgres@127.0.0.1:54422/postgres`).
 *
 * Both URLs work with the same client below because:
 *   - `prepare: false` is *required* by Supavisor transaction mode (no
 *     prepared statements across pooled connections) and harmless locally.
 *   - Pool size (`max`) defaults to 1 and is tunable via DB_POOL_MAX.
 *     Topologie: die KANONISCHE Prod ist der langlebige Coolify-Container
 *     auf metaspots — dort serialisiert max:1 alle parallelen Requests auf
 *     eine einzige Connection, ein höheres DB_POOL_MAX lohnt sich. Vercel
 *     ist nur Hot-Standby: dort gilt weiter die per-Lambda-Empfehlung
 *     max:1 (Supavisor multiplext über die Lambdas) — DB_POOL_MAX dort
 *     einfach ungesetzt lassen. Local dev: Default reicht.
 */

// DB_POOL_MAX (optional, siehe lib/server/env.ts): unset/leer/unbrauchbar → 1,
// damit sich ohne gesetzte Var NICHTS am bisherigen Verhalten ändert.
const poolMax = Math.max(1, Math.floor(Number(process.env.DB_POOL_MAX)) || 1);

const client = postgres(process.env.DATABASE_URL ?? '', {
  max: poolMax,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
});

export const db = drizzle(client, { schema: { ...schema, ...relations } });
