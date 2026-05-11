import { defineConfig } from 'drizzle-kit';

// Drizzle is a query-builder, not a migration tool in this setup. Supabase
// migrations under supabase/migrations/ remain the schema source of truth.
// `npx drizzle-kit introspect` reads the live Postgres schema and writes
// lib/server/db/schema.ts. See OSS_READINESS_PLAN.md §7.3 + §7.9.
export default defineConfig({
  schema: './lib/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@127.0.0.1:54422/postgres',
  },
});
