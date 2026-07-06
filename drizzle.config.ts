import { defineConfig } from 'drizzle-kit';

// Drizzle is a query-builder, not a migration tool in this setup. Supabase
// migrations under supabase/migrations/ remain the schema source of truth.
// The schema is hand-mirrored per domain in lib/server/db/schema/*.ts (do
// NOT run db:introspect — it renames existing relations and would overwrite
// the split). See OSS_READINESS_PLAN.md §7.3 + §7.9.
export default defineConfig({
  schema: './lib/server/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@127.0.0.1:54422/postgres',
  },
});
