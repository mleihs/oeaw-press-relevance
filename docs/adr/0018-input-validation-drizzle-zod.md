---
date: 2026-05-17
status: accepted
deciders: session (Matthias + Claude)
supersedes: none
---

# 0018 — Input validation at the API edge

## Context

26 API routes. The validation infra *already exists*: `withApiError`
+ `apiError` (`lib/server/http.ts`) and hand-written zod payload
schemas (`lib/shared/schemas.ts`, 7 schemas), but applied to only
~6 mutating routes. ~12 input-reading routes parse
`searchParams`/`params`/body with no schema, including the
security-sensitive `auth/gate`, plus `publications`, `…/[id]`,
`…/similar-pressed`, `export/csv|json`, `persons/[id]`,
`press-releases`, `review/queue`, `researchers/*`,
`publications/stats`. The `safeParse` + `apiError(…,400)` block is
duplicated in every validated route.

## Decision

Standardize input validation across *all* input-reading routes using
the existing `withApiError` + zod pattern. Add a thin
`validateBody` / `validateQuery` helper in `lib/server/http.ts` that
returns typed data or throws the structured 400; it removes the
duplicated `safeParse`/`apiError` block. Adopt `drizzle-zod` to derive
the table-shaped schemas from the Drizzle schema; keep hand-written
zod for action-shaped payloads (flag / decision / session-finish).
Input only: output stays per-feature `toApi()` (ADR 0003); the wire
shape stays snake_case + ISO-8601 (ADR 0004).

## Consequences

- ✅ Invalid input → deterministic 400, not undefined behaviour / 500;
  table schemas stay in sync with the DB; `auth/gate` hardened; far
  less per-route boilerplate.
- ⚠️ ~12 routes touched; query schemas must mirror real client
  payloads (derive from current usage; roll out route-by-route,
  mutations first).
- ↔️ One small shared helper in `lib/server/http.ts`: it validates,
  it does not serialize (consistent with ADR 0003).

## Implementation note (Pass A, 2026-05-17)

Two honest deviations from the literal plan, both forced by the codebase
and verified against it:

1. **Schema location.** The `drizzle-zod`-derived schema (`idParamSchema`,
   from `publications.id`) lives in a new server-only
   `lib/server/schemas.ts`, not `lib/shared/schemas.ts`. The
   eslint-plugin-boundaries kernel rule (`{ from: "shared", allow:
   ["shared"] }`) forbids the shared file from importing the Drizzle
   table, and doing so would bundle `postgres`/`pg-core` into the client
   (the Phase-A4 pitfall #26). Hand-written, zod-only query/param/payload
   schemas stay client-safe in `lib/shared/schemas.ts`.
2. **Table-row derivation scope.** Verified against the code: none of the
   ~12 Pass-A input routes accept a table-shaped *body* — they are query-,
   path-param-, or action-shaped, all of which this ADR already says to
   hand-write. So `drizzle-zod`'s insert/select-row derivation has no
   Pass-A consumer beyond the id-column schema; its first real use is
   Pass B's `CanonicalPublication` ingest DTO (ADR 0017). This is a
   documented no-op, not a deferral for zod-v4 incompat (v4 is
   compatible).

Helper set is `validateBody` / `validateQuery` / `validateParams`; they
throw `ApiValidationError`, which `withApiError` maps to a 400 logged at
warn (not the 500 `route_unhandled_error` path). Status: `accepted`,
unchanged.
