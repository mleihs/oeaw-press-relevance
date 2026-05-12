---
date: 2026-05-11
status: accepted
deciders: Phase-3 migration session
supersedes: none
---

# 0003 — Per-feature `toApi()` mapper, not a generic serializer

## Context

Drizzle returns camelCase fields (`row.webdbUid`, `row.publicationTypeId`).
The existing wire shape — consumed by ~80 client sites — is snake_case
(`webdb_uid`, `publication_type_id`) plus ISO-8601 timestamps. A generic
recursive `camelToSnake(obj)` serializer would have been one helper for
all features, but a renamed DB column would have **silently** changed the
wire shape without a single type error. The whole point of Drizzle was to
move drift from runtime to compile time.

## Decision

Each feature owns an explicit `toApi()` mapper, co-located with its
`db.query.*` callers (e.g. `lib/server/publications/to-api.ts` exports
`publicationToApi`, `publicationTypeToApi`, `personToApi`, …). Each mapper
has the shape `(row: typeof table.$inferSelect) => Wire` — Drizzle's
inferred row type on the left, the hand-written shared DTO on the right.
A column rename invalidates the mapper at compile time.

## Consequences

- ✅ Renaming `publications.haiku` → `publications.haiku_text` produces a
  tsc error in `publicationToApi`. There is no path that returns the row
  to the wire without going through the mapper.
- ✅ Each feature's wire shape can evolve independently.
- ⚠️ ~30 LOC of boilerplate per mapper (one assignment per column).
  Accepted as the cost of the compile-time guarantee.
- ⚠️ Embedded relations (person inside publication, etc.) need their own
  mappers — duplication or extraction is decided per feature, not by a
  framework rule.

## Alternatives considered

- **Generic recursive `camelToSnake(obj)`** — silent drift on rename;
  rejected.
- **Server returns camelCase, migrate the UI** — would touch 80+ client
  sites for zero functional gain; postponed indefinitely.
- **Drizzle `transform` codecs** — not available in the current Drizzle
  version for the postgres-js driver path we use.

## References

- `lib/server/publications/to-api.ts`
- `memory/phase3_handover.md` decision #1
- ADR 0004 (the snake_case + ISO-8601 wire shape this mapper produces)
