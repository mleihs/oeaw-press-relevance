---
date: 2026-05-17
status: proposed
deciders: session (Matthias + Claude)
supersedes: none
---

# 0017 — Ingest source-adapter boundary

## Context

`scripts/webdb-import.mjs` fetches the TYPO3/WebDB MySQL source,
transforms inline, and writes through a hand-rolled raw-SQL
`upsert(table, rows, conflictKey, updateCols)` (`scripts/lib/db.mjs`,
`pg.Client`), bypassing both the repository layer and Drizzle. There
is no normalizer/canonical boundary (`lib/server/source.ts` is
unrelated: it is the Fumadocs docs loader). WebDB is explicitly
temporary; the `api.elsevierpure.com` REST source is planned in ~1–3
months (memory `pure_api_migration_planned.md`). Today a second source
means a second monolithic script.

## Decision

Introduce a `SourceAdapter` boundary: each source implements
`fetch()` + `normalize(raw) → CanonicalPublication[]` (plus the
related entity DTOs: orgunit, extunit, person, person_publication,
lookups). One shared **TypeScript loader** consumes canonical batches
and does the idempotent upsert (natural key `webdb_uid`), DOI
extraction (reuse `scripts/lib/doi-extract.mjs`), analysis-field
preservation and orphan archival, using **Drizzle** (already a
dependency) instead of raw SQL. WebDB becomes adapter #1 (its current
fetch + inline transforms move into `normalize()`). Pure becomes
adapter #2 later; out of scope here. Scripts move to TS (precedent:
`scripts/enrich-orphans.ts` + `tsx`).

## Consequences

- ✅ Pure migration becomes a new adapter, not a rewrite; both can run
  in parallel during cutover; the transform becomes unit-testable; the
  loader is type-safe and consistent with the app's Drizzle layer.
- ⚠️ ETL scripts become TS; one more boundary + a canonical DTO to
  keep in sync with the schema.
- ↔️ Lose ad-hoc per-table raw-SQL flexibility in the importer; parity
  must be proven against the local DB before any prod ETL
  (`production_db_safety.md`).
