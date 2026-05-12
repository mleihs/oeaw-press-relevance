---
date: 2026-05-11
status: accepted
deciders: Phase-3 migration session
supersedes: none
---

# 0004 — Wire shape stays snake_case + ISO-8601

## Context

The legacy wire shape — inherited from PostgREST when the project ran on
raw Supabase-JS — uses snake_case keys and ISO-8601 UTC strings for
timestamps. The UI consumes this shape from ~80 sites: filters, tables,
detail pages, exports. Drizzle's `timestamp({ mode: 'string' })` returns
the *raw* Postgres form (`2026-04-30 10:29:20.58458+00`), which is
neither ISO-Z nor what the UI expects. Date columns (`published_at`) are
plain `YYYY-MM-DD` and must stay that way for date-range filters.

## Decision

The wire shape contract is:

- **Property keys**: `snake_case`. Mapping happens in feature `toApi()`
  helpers (see ADR 0003).
- **Timestamps**: ISO-8601 with `Z` suffix, normalised via
  `new Date(row.x).toISOString()` inside every mapper that surfaces a
  `timestamp` column.
- **Date-only columns**: `YYYY-MM-DD`. No `toISOString()` — would shift
  to UTC midnight and break Austrian-local-day filters.

Test assertions on timestamp fields should match `/^\d{4}-\d{2}-\d{2}T/`,
not the raw PG form.

## Consequences

- ✅ Switching the DB driver in the future cannot leak driver-specific
  date strings to the UI — the mapper layer normalises.
- ✅ Existing UI date parsers (`new Date(...)`) keep working unchanged.
- ⚠️ Every new mapper must remember the conversion; smoke tests should
  cover at least one timestamp field per feature.

## Alternatives considered

- **camelCase + raw PG strings** — would touch 80+ UI sites for no
  benefit; rejected.
- **Drizzle `mode: 'date'`** — server payload would contain JS `Date`
  objects, which would JSON-serialise as ISO-Z but lose round-trip
  type-safety (the wire DTO is `string`, not `Date`); rejected.

## References

- `memory/phase3_handover.md` decision #4
- `docs/TESTING.md` §5.2 (Phase-3 gotcha that motivated the explicit rule)
- `lib/server/publications/to-api.ts` (canonical implementation)
