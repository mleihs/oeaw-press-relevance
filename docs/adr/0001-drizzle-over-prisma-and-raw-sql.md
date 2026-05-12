---
date: 2026-05-11
status: accepted
deciders: Phase-3 migration session
supersedes: none
---

# 0001 — Drizzle ORM over Prisma and raw Supabase-JS

## Context

Pre-Phase-3, every DB call ran through `supabase.from('publications').select('*, …')`
with manual `as Publication[]` casts. A column rename was a runtime error
discovered in production. The Supabase-JS PostgREST client also imposed a
silent 1000-row cap on `.select()` results and gave no SQL surface for
window functions, `NULLS LAST`, or array parameters. We needed a type-safe
DB layer that an OSS contributor could read without learning a code-gen
toolchain.

## Decision

Drizzle ORM with the `postgres-js` driver, instantiated once as a singleton
in `lib/server/db/index.ts`. Schema is **introspected** from the live
Postgres (`drizzle-kit introspect`) into `lib/server/db/schema.ts`;
`supabase/migrations/*.sql` stays the source-of-truth — Drizzle is a query
builder, not a migration tool in our setup.

## Consequences

- ✅ Column renames surface as `tsc` compile errors at every call site.
- ✅ Per-route SQL control: explicit `NULLS LAST`, paged `LIMIT/OFFSET`,
  array binds, joins via the `relations` API.
- ✅ No PostgREST silent truncation — `/export/csv` ships all rows now.
- ⚠️ Drizzle has quirks the team must know: `sql.param(arr)` for array
  parameters, relation names must not shadow same-table columns
  (see `docs/TESTING.md` §5 for the catalogue). Each is smoke-tested
  per route.
- ↔️ RLS is no longer auto-applied (postgres-js connection pool runs as
  service-role). Single-tenant tool today; multi-tenant would need
  per-request `SET LOCAL request.jwt.claims` or a separate Drizzle pool.

## Alternatives considered

- **Prisma** — heavier, code-gen step, Edge-runtime friction. Largest
  community but the wrong shape for this codebase's small surface.
- **Kysely** — pure type-safe SQL builder; manual schema types, less
  ergonomic joins, no `relations` API.
- **Stay on raw Supabase-JS** — the status quo whose pain motivated the
  migration; rejected.

## References

- `OSS_READINESS_PLAN.md` §7 (full migration plan)
- Commits `a50a97a..7f81300` (Tasks 3.0–3.21)
- `memory/phase3_handover.md` (load-bearing decisions + four Drizzle gotchas)
