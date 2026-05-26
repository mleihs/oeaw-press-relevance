---
date: 2026-05-17
status: accepted
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

## Implementation (2026-05-18, accepted)

Shipped in Pass B of `LIBS_CLEANUP_PLAN_2026-05-17.md`.

- `lib/server/ingest/`: `canonical.ts` (DTOs + the WebDB-owned column
  lists), `source-adapter.ts` (`SourceAdapter<Raw>`: `name` / `fetch()` /
  `normalize(raw) -> CanonicalBatch`), `upsert.ts` (Drizzle batched
  `onConflictDoUpdate`/`DoNothing`, replaces the hand-rolled
  `scripts/lib/db.mjs` `upsert`), `loader.ts` (the .mjs `main()` ordering,
  1:1), `adapters/webdb-normalize.ts` (PURE transform; 10 Vitest, 174
  total green) + `adapters/webdb.ts` (mysql2 `fetch()`). Entry point
  `scripts/webdb-import-v2.ts`; legacy `scripts/webdb-import.mjs` stays the
  operational path until the gate passes.
- **Interface final.** `normalize` is pure/sync (no DB, no clock — the
  loader stamps `synced_at`); FK resolution + the two publication archival
  passes + is_ita refresh move into the loader (same end-state as the
  .mjs in-transform `fkMap()`).
- **Refinement 1 — DOI extract injected at the script seam.** The ADR's
  "reuse `scripts/lib/doi-extract.mjs`" is honored by *injecting* it
  (`scripts/webdb-import-v2.ts` is a `scripts` element, allowed to import
  both `scripts` and `server`); `lib/server/ingest` never imports
  `scripts/**`, so no new `eslint-plugin-boundaries` violation and zero
  fork/drift (literal reuse of the module the legacy ETL + session
  doi-backfill already share).
- **Refinement 2 — scope of "Drizzle not raw SQL".** The removed thing is
  the hand-rolled generic `pg.Client` upsert. Set-based maintenance
  (archival UPDATEs, parent-FK 2nd pass, is_ita refresh, the 3 SQL
  functions, `REFRESH MATERIALIZED VIEW`) has no query-builder form and
  was always SQL; it stays as `sql` templates executed through the same
  Drizzle client (single connection, type-safe boundary).
- **Hardening (behavior-preserving).** The analysis-preservation invariant
  is now an explicit, unit-tested disjoint-column contract
  (`PUBLICATION_WEBDB_UPDATE` ∩ `PUBLICATION_ANALYSIS_COLUMNS` = ∅) instead
  of the .mjs's implicit "just don't add the keys".
- **Gate.** `scripts/parity-gate.ts` (read-only, local-only) is the
  MANDATORY precondition: `gate baseline old new` must exit clean
  (transform parity old-vs-new + analysis preservation baseline-vs-new)
  before webdb-import-v2 may touch prod. Not yet executed — local stacks
  (Supabase 54422 / MySQL 54499) were down this session; Pass B ships the
  code + gate + protocol and runs zero prod ETL.

## Single-table variant (2026-05-26)

The events feature (`/events`) added a second adapter shape that
deliberately skips the `CanonicalBatch` / `loader.ts` / `upsert.ts`
apparatus: see [ADR 0019](./0019-events-feature-pattern-variants.md).
The valuable half — pure synchronous `normalize(raw)` — is preserved
verbatim; the DB write moves into the feature layer because there is
no junction-table graph to keep transactionally consistent.

Decision rule for future adapters: graph-shaped sources (multi-table,
junctions) follow the full pipeline; single-table sources follow
`adapters/typo3-events.ts`.
