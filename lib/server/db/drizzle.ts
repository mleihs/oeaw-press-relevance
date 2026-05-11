import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import * as relations from './relations';

/**
 * Drizzle DB client. Use this for SELECT / INSERT / UPDATE / DELETE queries
 * in route business-logic (lib/server/<feature>/*.ts). The Supabase-JS
 * client still handles Auth, Realtime, Storage and RPC calls; both share
 * the same Postgres pooler.
 *
 * RLS: the postgres-js pool connects as service-role (or with
 * DATABASE_URL's account), so no automatic RLS. Server code is responsible
 * for any explicit access checks. See OSS_READINESS_PLAN.md §7.7.
 */
const client = postgres(process.env.DATABASE_URL ?? '', {
  max: 10,
  idle_timeout: 30,
});

export const db = drizzle(client, { schema: { ...schema, ...relations } });
