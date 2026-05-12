/**
 * Single import surface for everything DB-related on the server:
 *
 *   import { db, publications, eq } from '@/lib/server/db';     // Drizzle
 *   import { getSupabaseAdmin } from '@/lib/server/db';          // Supabase
 *
 * Drizzle handles SELECT / INSERT / UPDATE / DELETE; Supabase-JS keeps
 * Auth / Realtime / Storage / RPC. Both share the same Postgres pooler.
 */
export { db } from './drizzle';
export * from './schema';
export * from './relations';
export { getSupabaseFromRequest, getSupabaseAdmin } from './supabase';
export { descNullsLast, ascNullsLast } from './sort';
