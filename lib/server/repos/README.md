# `lib/server/repos/` — repository layer

Thin, **primitive-only** wrappers between Drizzle and the per-feature
business-logic files (`lib/server/<feature>/*.ts`). Each repo:

- Imports the `db` singleton from `@/lib/server/db` directly.
- Returns **raw Drizzle rows** (camelCase, with relation joins as
  inferred). Wire-shape mapping (`publicationToApi`, etc.) is the
  consumer's responsibility — see
  [ADR 0003](../../../docs/adr/0003-per-feature-toapi-not-generic-serializer.md).
- Holds **no business logic.** Filter orchestration, decision-state
  semantics, ranking fusion all live in the feature files; the repo
  only knows how to read or write a publications row.

The goal is **Vitest mockability** (Phase 4): the consumer's unit test
mocks the repo and asserts on business-logic branches without spinning
up a Postgres or stubbing the entire Drizzle singleton.

## What belongs here

A method belongs in a repo if **all** of these hold:

1. It's a Drizzle-builder query (`db.select`, `db.query.X.findMany`,
   `db.update.returning`, …) on the entity's table — **or** it's a
   filter-pre-fetch the entity's feature consistently reads (e.g.
   "publications-by-flag" stays with publications because that's where
   the result is consumed).
2. ≥2 call sites reference the same query shape today, **or** the
   query needs to be mocked from a test that already exists.
3. It returns primitives (rows, counts, ID-sets) — not feature DTOs.

## What does NOT belong here

- **Business logic**: `applyDecision` (decision + session lazy-create +
  MeisterTask push) lives in `lib/server/publications/decisions.ts`.
- **Trivial single-call-site queries**: `listOrgunits` only has one
  caller and the Drizzle is one `.select().orderBy()` — inlining in
  `lib/server/orgunits/list.ts` is fine.
- **SQL-function-only routes**: when the only DB call is
  `db.execute(sql\`SELECT * FROM fn(...)\`)`, the route stays a thin
  adapter (see [ADR 0005](../../../docs/adr/0005-sql-functions-stay-in-postgres.md)).
- **Wire-shape mapping**: that's `toApi()` territory in the feature folder.

## Current contents

| Repo | Entity | Methods | Consumers |
|---|---|---|---|
| `publications.ts` | `publications` table + filter pre-fetches | 15 | `publications/{list,fetch,decisions,flag}.ts`, `review/queue.ts` |

### Why no `embeddings.ts` yet

A future `embeddings.ts` is planned for Phase A6 (Story-Bundles —
semantic clustering). Today there are **zero TypeScript consumers** of
`publication_embeddings` — the table is populated by
`scripts/embeddings/compute-embeddings.py` and consumed via the
`similar_pressed_pubs(…)` Postgres function (which goes through ADR
0005's "SQL functions stay in Postgres" rule, not through Drizzle).
Writing the repo now would mean a file with no callers. Premature
abstraction trumps planning symmetry; the repo lands when A6 starts.

### Why no `triage/`, `pipeline/`, `coverage/` domain-modules

The Phase-A1 plan proposed bundling cross-feature operations into
domain folders. The audit (commit pending alongside this update) found
that Phase-3 + Phase-A2 had already eliminated the fan-out the plan
anticipated — `applyDecision` is single-orchestrator, pipeline state
is a typed union, `promote_press_release_orphans` is a SQL function
whose two callers can't import `lib/server/`. See
[ADR 0008](../../../docs/adr/0008-domain-modules-deferred.md) for the
per-domain rationale. Same disciplinary pattern as the
entity-by-entity skip table above: structure follows the smell, not
the diagram.

## Drizzle gotchas to know

See `docs/TESTING.md` §5 for the catalogue. The ones the publications
repo actively guards against:

1. **`sql.param(arr)`** for array parameters bound to `::uuid[]` or
   `::text[]` casts (see `findIdsByOestat6`).
2. **Relation names must not shadow same-table columns** —
   `publicationTypeRef` not `publicationType`. Smoke covers this with
   a `typeof row.publicationType === 'string' | null` assertion.
3. **`timestamp({mode: 'string'})` returns raw PG form** — repo
   returns raw rows; consumer's `toApi()` normalises to ISO-8601.

## NULLS-LAST sort helper

`desc()`/`asc()` from `drizzle-orm` don't surface Postgres's `NULLS
LAST/FIRST` modifier. Several call sites need NULLS LAST so that
unscored pubs don't dominate the top of every DESC list. Use
[`descNullsLast` / `ascNullsLast`](../db/sort.ts) from
`@/lib/server/db` rather than rolling
`sql\`${col} DESC NULLS LAST\`` at the call site — keeps the
workaround discoverable in one place.

## Adding a new repo

1. Open an ADR if the new repo represents a load-bearing architectural
   choice (rare — most repos are mechanical extractions).
2. Create `lib/server/repos/<entity>.ts` with the pattern above.
3. Add a row to the table in this README.
4. Commit a `scripts/smoke/repos/<entity>.ts` smoke that covers every
   method's branches — including the empty-array / null-input / large-
   set cases.
5. Refactor existing call sites to use the repo. Keep the wire-shape
   mapping in the feature folder.
