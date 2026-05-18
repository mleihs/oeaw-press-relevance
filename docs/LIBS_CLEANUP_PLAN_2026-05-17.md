# Library/Architecture Cleanup Plan (2026-05-17)

Origin: session analysis of "which libs (Marke Drizzle) would make the
app cleaner". Verdict: the stack is already well-curated; the real
levers are (a) *use libs already owned* and (b) one tiny new dep
(`drizzle-zod`) at the API edge. Three independent, separately-shippable
passes. ADRs: [0017](adr/0017-source-adapter-boundary.md) (proposed),
[0018](adr/0018-input-validation-drizzle-zod.md) (accepted).

## Status snapshot

| Item | State |
|---|---|
| Session deploys (live) | `2971f63` capybara/hero/nav · `73c1046` a11y+darkButton+proxy · `a2f68e7` doc-pass |
| Durable artifacts (this plan + ADR 0017/0018 + index) | committed + pushed (`e3efb38`) |
| Deep-link `?next=` bug | fixed (`40316e2`) |
| In-range dep refresh (pre-Pass-A, user-chosen) | DONE, prod-verified (`08a6cf6`) |
| Pass A (drizzle-zod + edge validation) | **DONE**, prod-verified (`80a7d3e` + self-review cleanup `2bc5937`); canonical 200 |
| Pass B (ingest adapter, ADR 0017) | **CODE-COMPLETE**, ADR 0017 accepted; `lib/server/ingest/*` + `scripts/webdb-import-v2.ts` + `scripts/parity-gate.ts` + 10 Vitest (174 total green). **Parity RUN pending** — local stacks (Supabase 54422 / MySQL 54499) were down; the gate is the hard precondition before ANY prod ETL; legacy `.mjs` stays operational until it passes |
| Pass C (virtualize publication-table) | not started (next; needs Playwright+axe gate) |
| Deferred deps (deliberate, NOT staleness) | eslint 10 (blocked by next/boundaries plugin), react-day-picker 10 (breaking UI), @types/node 25 (tracks Node runtime) |
| npm audit | 10 moderate, pre-existing transitive (esbuild via drizzle-kit devdep; postcss via next) — npm's fixes are breaking downgrades, left untouched by design |

## Resolved premise (was partly wrong, corrected)

Validation infra **exists** and is used in ~6 mutating routes:
`withApiError`+`apiError` (`lib/server/http.ts`), 7 hand-written zod
schemas (`lib/shared/schemas.ts`). Gap = ~12 input-reading routes with
**no schema**: `auth/gate`, `publications`, `publications/[id]`,
`publications/[id]/similar-pressed`, `export/csv`, `export/json`,
`persons/[id]`, `press-releases`, `review/queue`,
`researchers/distribution`, `researchers/top`, `publications/stats`.
Plus: `safeParse`+`apiError` boilerplate duplicated per route.

## Pass A: drizzle-zod + API-edge validation  (do FIRST; ADR 0018)

- [x] `drizzle-zod@^0.8.3` added — zod-v4 compatible (peer
      `zod@^3.25||^4.0`, `drizzle-orm>=0.36`), so the derivation was
      **not** deferred for compat.
- [x] `validateBody` / `validateQuery` / **`validateParams`** in
      `lib/server/http.ts` → typed data or a thrown `ApiValidationError`
      that `withApiError` maps to a structured 400 at warn-level (not the
      500 `route_unhandled_error` path). Replaces the per-route
      `safeParse`+`apiError` block.
- [x] Table-shaped derivation = `idParamSchema` via `drizzle-zod` from
      `publications.id`. **Deviation (intentional, documented):** it
      lives in a new server-only `lib/server/schemas.ts`, NOT
      `lib/shared/schemas.ts` — the eslint-plugin-boundaries kernel rule
      forbids `shared → server` and colocating the Drizzle table import
      in the client-shared file is the Phase-A4 postgres-bundling pitfall
      (#26). **Finding (verified, not fabricated):** none of Pass A's
      input-reading routes take a table-shaped *body* (all query-, path-
      param-, or action-shaped → hand-written, as the plan allows); the
      first real table-row `drizzle-zod` consumer is Pass B
      (`CanonicalPublication`, ADR 0017). Hand-written zod query/param/
      payload schemas added to `lib/shared/schemas.ts` (kernel-clean).
- [x] Applied: mutations first (`auth/gate`, `publications/[id]/decision`
      DRY'd, `publications/[id]/flag` DRY'd ×2) then the input-bearing
      GET/export routes (`publications`, `publications/[id]`,
      `…/similar-pressed`, `export/csv|json`, `persons/[id]`,
      `researchers/distribution`, `researchers/top`,
      `publications/stats`). Verified-no-ops (input fully narrowed
      downstream → no schema, documented, no fabricated diff):
      `press-releases/promote-status` (GET, zero input),
      `press-releases` (exact `=== 'true'` + tri-state `orphans`),
      `review/queue` (isDecision / `sort==='combined'`). Schemas derived
      from *actual current usage* (verified against the nuqs parsers +
      hardcoded client values); valid traffic unchanged, only prior
      `NaN`-offset / `NaN::int` 500-vectors and malformed UUIDs now
      return a clean 400.
- [x] **Post-review cleanup** (self-critique pass): removed the two
      decorative `.loose()` guards (press-releases/review-queue) that
      could not reject anything → honest verified-no-ops; folded the
      CSV-list parse into the schema (`csvParam` `.transform()`) so the
      `csv()` helper is no longer copy-pasted across both researchers
      routes (the exact duplication ADR 0018 targeted). Conscious
      remaining tradeoff: the `publications` route edge-asserts
      `page`/`pageSize` while `listPublications` keeps its own tested
      35-param parse (dual-parse) — refactoring that hot path is a
      higher regression risk than the smell warrants; kept + documented.
- [x] Vitest: +28 (lib/shared/schemas.test.ts, lib/server/schemas.test.ts,
      lib/server/http.test.ts) — 164 total green.
- [x] Verify protocol passed (typecheck/lint/em-dashes/test all 0; only
      the expected `[boundaries]` v5→v6 warning) → commit → push. ADR
      0018 stays `accepted`.

## Pass B: Ingest source-adapter  (ADR 0017)

- [x] ADR 0017 → `accepted` (2026-05-18; interface final, two refinements
      documented in the ADR Implementation section).
- [x] `CanonicalPublication` + related DTOs + lookups + 9 junction DTOs +
      `CanonicalBatch` (`lib/server/ingest/canonical.ts`); analysis cols
      modelled out; WebDB-owned update-column lists are explicit constants.
- [x] `SourceAdapter<Raw>` iface (`name` / `fetch()` /
      `normalize(raw)→CanonicalBatch`); `normalize` is pure/sync.
- [x] TS loader (Drizzle): `loader.ts` is the .mjs `main()` 1:1 (lookups
      → entities → publications [pre-clean + dedupe-in-normalize + archive]
      → junctions [TRUNCATE+upsert, is_ita refresh] → 3 SQL fns → matview).
      Generic batched `onConflictDoUpdate`/`DoNothing` in `upsert.ts`
      replaces the hand-rolled `scripts/lib/db.mjs` upsert. DOI extract =
      the shared `scripts/lib/doi-extract.mjs`, injected at the v2-script
      seam (no `server→scripts` boundary edge). Analysis preservation =
      explicit unit-tested disjoint-column contract.
- [x] WebDB = adapter #1 (`adapters/webdb.ts` fetch / `webdb-normalize.ts`
      pure). Entry `scripts/webdb-import-v2.ts` (PG_DATABASE_URL contract +
      hard non-127.0.0.1 refuse-guard). Pure = future, out of scope.
- [~] Parity gate: `scripts/parity-gate.ts` (`snapshot|diff|preserved|
      gate`, read-only, local-only) + embedded protocol SHIPPED. **RUN not
      executed** (local Supabase 54422 / MySQL 54499 were down). The clean
      `gate baseline old new` exit is the MANDATORY precondition before any
      prod ETL; until then the legacy `.mjs` stays the operational path.
      Pass B ran zero prod ETL (consistent with "before any prod ETL").

## Pass C: Virtualize `publication-table.tsx`  (no new dep)

- [ ] `@tanstack/react-virtual` (already a dep) on the desktop
      `<table>` + mobile cards; **dynamic `measureElement`** (rows
      expand → variable height); **spacer-row technique** to keep
      `<table>/<thead>/<tbody>` semantics + sticky thead + the
      `scope`/`aria-sort` a11y shipped in `73c1046`.
- [ ] Bounded `max-h` scroll container (UX change, flag it).
- [ ] Threshold-gate: only virtualize N > ~100 so the paginated common
      case stays byte-identical (de-risk).
- [ ] Playwright + `@axe-core/playwright` before/after (a11y regression
      guard). Fallback: ship threshold-gated, iterate.

## Sequencing rationale

A → B → C (risk-adjusted, *not* UX-ROI). A: clearest win, mechanical,
additive, lowest regression. B: highest architectural leverage +
time-sensitive (Pure migration), but data-sensitive → own calm pass.
C: highest UX-ROI but highest regression surface and least urgent
(pagination already covers the common path). Reversible: flip C first
if the table is a daily perf pain.

## Verify / commit / push protocol (repeat every pass)

1. Stop the dev server first (WSL2 OOM during `tsc`, happened once).
2. `npm run typecheck` && `npm run lint` && `npm run check-em-dashes`
   Capture **explicit exit codes** (don't pipe through `tail`).
   The only expected lint output is the pre-existing non-failing
   `[boundaries]` v5→v6 warning.
3. Stage only intended paths; **never** `tsconfig.json` (Next tooling
   churn) or `HANDOVER.md` (untracked, not ours). Verify
   `git diff --cached --stat` before commit.
4. Conventional commit, ASCII only (no em/en-dash; em-dash gate),
   trailer `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
5. `git push origin main` (trunk-based; Vercel auto-deploys).
6. Verify **directly** (the `vercel ls|grep` poller hangs under load):
   deploy `● Ready` + canonical `https://oeaw-press-relevance.vercel.app/`
   → 200. Per-deployment `*-matthias-leihs-projects.vercel.app` → 401
   is expected (SSO; canonical bypasses).
7. Restart dev: `NODE_OPTIONS=--max-old-space-size=1536 npm run dev`
   (Supabase intentionally stopped → local DB pages 500 until
   `supabase start`; that is the chosen local state).

## Parity-gate RUN (open precondition before ANY prod ETL)

Pass-B code is shipped but the gate was never executed (stacks down).
Before webdb-import-v2 may touch prod, run, with local Supabase 54422 +
the MySQL dump 54499 up (full protocol in `scripts/parity-gate.ts`
header):

1. `pg_dump` backup → `data/backups/publications-pre-import-<ts>.sql.gz`.
2. `npm run parity-gate -- snapshot baseline`
3. `node scripts/webdb-import.mjs` (legacy)
4. `npm run parity-gate -- snapshot old`
5. restore the backup (DB == baseline)
6. `npm run webdb-import:v2` (new)
7. `npm run parity-gate -- snapshot new`
8. `npm run parity-gate -- gate baseline old new` → must exit clean.

Only a clean `gate` clears webdb-import-v2 for prod. Until then the
legacy `.mjs` is canonical.

## RESUME after `/clear`  (paste this)

> Lies `docs/LIBS_CLEANUP_PLAN_2026-05-17.md` (Status-Snapshot, Pass-C-
> Checkliste, Parity-gate-RUN-Block, Verify/commit/push-Protokoll) +
> Memory `libs_cleanup_plan_progress.md`. **Pass A + Pass B sind FERTIG**
> (A: `08a6cf6`/`80a7d3e`/`2bc5937`; B: Ingest-SourceAdapter ADR 0017,
> code-complete, ADR accepted — `lib/server/ingest/*` +
> `scripts/webdb-import-v2.ts` + `scripts/parity-gate.ts` + 10 Vitest
> (174 total), Prod-Canonical 200). **Offen an B:** nur der Parity-gate-RUN (Stacks
> waren down) — das ist die zwingende Vorbedingung vor JEDEM Prod-ETL,
> NICHT Teil von Pass C; bis dahin ist die Legacy-`.mjs` kanonisch
> (`production_db_safety.md`). Setze **Pass C** um
> (`publication-table.tsx` virtualisieren, `@tanstack/react-virtual`
> bereits Dep): dynamic `measureElement` + Spacer-Row-Technik (Table-
> Semantik + sticky thead + `scope`/`aria-sort` aus `73c1046` erhalten),
> bounded `max-h` (UX-Change flaggen), Threshold-Gate N>~100 (paginierter
> Normalfall byte-identisch). **Playwright + `@axe-core/playwright`
> before/after als A11y-Regressions-Gate** (Fallback: threshold-gated
> shippen, iterieren). Halte das Verify/commit/push-Protokoll aus diesem
> Plan-File **exakt** ein (dev-server vor `tsc` stoppen; explizite
> Exit-Codes; nie `tsconfig.json`/`HANDOVER.md` stagen; ASCII-Commit;
> push origin main; Deploy via canonical
> `https://oeaw-press-relevance.vercel.app/` → 200 verifizieren —
> `vercel ls|grep` hängt unter Last; die `[boundaries]` v5->v6-Warnung
> ist der einzige erwartete Lint-Output).

Memory pointers: `libs_cleanup_plan_progress.md`,
`pure_api_migration_planned.md`,
`production_db_safety.md`, `dark_mode_token_conventions.md`,
`command_palette_built.md`, `wsl2_oom_risk.md`,
`vercel_cli_workflow.md`.
