# Testing Strategy

**Status:** Draft 2026-05-11 — Phase 3 closeout / Phase 4 prep.
**Owner:** server/Drizzle migration session, see `OSS_READINESS_PLAN.md` §7.10 + §8.

This document captures the test-DB-connection strategy required by Phase 3
acceptance criterion §7.10 ("Test-DB-Connection-Strategy dokumentiert"). It
also collects the smoke-test conventions used during Phase 3, so Phase 4 (real
Vitest coverage) can adopt them without re-deriving the trade-offs.

---

## 1. Three test rings

We have three independent test rings, each with its own DB-connection story:

| Ring | What it covers | DB | Today |
|---|---|---|---|
| **Unit (Vitest)** | Pure-function logic in `lib/server/**` + `lib/shared/**` | In-memory mock or pg-mem | 40 tests, no DB |
| **Smoke (one-off `npx tsx scripts/__smoke-*`)** | Each feature's Drizzle pipeline end-to-end | Live local Supabase CLI DB | Used during Phase-3 migration, scripts deleted after green |
| **e2e (Playwright)** | UI + full Next.js stack against a real DB | Live local Supabase CLI DB via `DATABASE_URL` | 4 specs in `e2e/` |

The three rings layer cleanly: unit-tests guard pure logic, smoke-tests guard
the Drizzle ↔ Postgres binding, e2e guards the wire shape and UI.

---

## 2. Vitest unit tests — DB-connection strategy

**Recommendation: `drizzle-orm/pg-proxy` + an in-memory query handler.**

The `lib/server/<feature>/*.ts` functions all consume the `db` singleton from
`@/lib/server/db`. To unit-test them, we have two paths:

### 2.1 Option A — `drizzle-orm/pg-proxy` (no Postgres at all)

`pg-proxy` is a Drizzle driver that delegates query execution to a user-supplied
async function. In tests, that function returns canned rows for known SQL —
the unit-test never touches Postgres. Fast (no spin-up), deterministic, and
covers the Drizzle SQL the function actually builds.

Trade-off: the test couples to Drizzle's exact SQL output, which can drift as
Drizzle upgrades. Mitigate by extracting per-feature query builders (e.g.
`buildPublicationListWhere(filters)`) and asserting on their `.toSQL()` output
instead of intercepting the runtime call.

### 2.2 Option B — `pg-mem` (in-process Postgres)

`pg-mem` parses and executes SQL in-process. With Drizzle's `postgres-js`
adapter pointed at pg-mem's emulated connection, the same `db` singleton
works. Limitations: no RLS, no triggers, partial pgvector, no functions in
`plpgsql`. Most of the functions we migrated (`pub_ids_by_oestat6`,
`top_researchers`, `researcher_detail`, `publication_dashboard_stats`) are SQL
functions that **won't run** under pg-mem — those code paths need pg-proxy with
canned rows, or testcontainers (§2.3).

### 2.3 Option C — `testcontainers` + ephemeral Postgres

`testcontainers` spins up a real Postgres container per test suite (~5-10 s).
The Supabase-CLI migration tree applies cleanly, including pgvector and
plpgsql functions. Slower but authentic.

### 2.4 Recommended ladder

1. **Default to pg-proxy** for unit-tests on the Phase-2-extracted business
   logic (`lib/server/publications/list.ts`, `decisions.ts`, etc.).
2. **Upgrade to testcontainers** when the function under test calls a SQL
   function (any `db.execute(sql\`SELECT * FROM fn(...)\`)` from the routes
   migrated in Phase-3 Tasks 3.14–3.20).
3. **Don't use pg-mem** for this codebase — the missing plpgsql support means
   half our queries fail to plan.

---

## 3. e2e — DB-connection strategy

Playwright reuses the dev server (`npm run dev`) and therefore the same
`DATABASE_URL` from `.env.local`. The current spec asserts on the **live local
dataset** — counters, queue presence, decision-toolbar visibility — without
mutating anything.

**Critical guard:** never run write-path Playwright tests against the local
dev DB. Pitch decisions push to MeisterTask DEV-IDs (project 9147401) and
contaminate the analyst view. If a write-path e2e is needed:

1. Use the testcontainers Postgres + a pre-applied dump (the e2e job in CI
   already provisions one — see Plan §8.6).
2. Stub the MeisterTask client at the network boundary with MSW.

The `e2e/global-setup.ts` already covers the gate-cookie shape; nothing in
the DB-connection path needs to change for read-only e2e.

---

## 4. Smoke-test convention (what Phase 3 used)

Every Drizzle migration in Phase 3 followed the same recipe:

```bash
cat > scripts/__smoke-<feature>.ts << 'EOF'
import { ... } from '../lib/server/<feature>/...';
async function main() {
  // exercise every branch the migration touched — null + single + multi
  // values for array params, the not-found path, all metric variants, etc.
}
main().catch((e) => { console.error('FAIL:', e); process.exit(1); });
EOF
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54422/postgres' \
  npx tsx scripts/__smoke-<feature>.ts
rm scripts/__smoke-<feature>.ts
```

Conventions:

- File name **must** start with `__smoke-` so a stray commit is obvious in
  `git status`.
- File is **deleted after green** — it's not a regression test, it's a
  one-shot verification. The Phase-4 Vitest suite will absorb the assertions
  that prove load-bearing.
- Cover every branch the new code introduces. Examples from Phase 3:
  - `list.ts` smoke had 10 cases (each filter path).
  - `queue.ts` smoke had 7 cases (each decision state + edge cases).
  - `top_researchers` smoke had 5 metrics × null/single/multi array params.

---

## 5. Phase-3 gotchas worth carrying into Phase 4

Two test-relevant gotchas surfaced during the routes migration. Phase-4 tests
should cover both:

### 5.1 Drizzle's sql tag expands JS arrays into IN-clause parens

`sql\`... ${arr}::text[] ...\`` does NOT bind `arr` as a Postgres text-array.
Drizzle's `sql` template sees `Array.isArray(chunk)` and expands it into
`($1, $2, ...)::text[]` — which Postgres can't parse as an array literal.

**Use `sql.param(arr)` instead** — it binds the whole array as one parameter,
which postgres-js then serialises as a proper `text[]` / `uuid[]`.

This bug was latent in `lib/server/publications/list.ts` after Task 3.8 and
escaped the smoke test because the oestat6/highlight/flagged filter paths
weren't exercised end-to-end. The Phase-4 Vitest spec for `listPublications`
must cover at least one filter that pre-fetches an array of IDs.

### 5.2 Wire-shape ISO-8601 normalisation

Drizzle's `timestamp(..., { mode: 'string' })` returns the raw PG timestamp
(`2026-04-30 10:29:20.58458+00`) — not ISO-Z. Every `toApi()` mapper must
explicitly normalise: `new Date(row.x).toISOString()`. Test assertions on
date fields should match the regex `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/`,
not the raw PG form.

### 5.3 `db.execute<TRow>` generic constraint

`db.execute<TRow extends Record<string, unknown>>(sql\`...\`)` rejects shared
TypeScript interfaces (which lack an index signature). For DTOs declared via
`interface`, cast the result instead of constraining the call: `(await
db.execute(sql\`...\`)) as unknown as TopResearcherRow[]`. The shared DTOs
should NOT grow index signatures just to satisfy this — they'd accept any
extra field by mistake.

### 5.4 Relation names must not shadow same-table columns

A `relations(table, ({one}) => ({ <name>: one(otherTable, ...) }))` whose
`<name>` matches a column on `table` SILENTLY shadows the column in
`db.query.<table>.findX({ with: { <name>: ... } })` results. The first
hit was `publications.publication_type` (text scalar) vs. a relation
named `publicationType` pointing at the `publication_types` table —
`row.publicationType` came back as `{nameDe, nameEn, ...}` instead of
the text, leaking through `publicationToApi()` into the wire shape and
crashing React on the `<span>{pub.publication_type}</span>` render.

**Rule:** any relation that joins through an FK whose source table has
a denormalised text copy of the FK target's name needs a suffix —
`publicationTypeRef` not `publicationType`. The hotfix is in commit
5ac68bd (`fix(server/db): rename publicationType relation to
publicationTypeRef`).

**Test assertion:** for every route that uses
`db.query.<table>.findX({ with: { ... } })`, smoke + Phase-4 Vitest
should check `typeof row.<denorm-text-column> in ['string', 'object']`
where 'object' is only acceptable for `null`. The bug would've been
caught by a single `expect(typeof res.publication_type).not.toBe('object')`
that distinguishes null from non-null objects.

---

## 6. Open items for Phase 4

- Wire `vitest.config.ts` with the pg-proxy adapter (Plan §8.2).
- First spec to write: `listPublications` with the array-binding gotcha
  covered (§5.1 above).
- CI workflow per Plan §8.6 with testcontainers for the SQL-function suite.
- Coverage targets per Plan §8.7.
