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
| Durable artifacts (this plan + ADR 0017/0018 + index) | committed + pushed this turn (see `git log`) |
| Deep-link `?next=` bug | quick-fix this turn, own commit (see `git log`) |
| Pass A (drizzle-zod + edge validation) | **NOT STARTED**, resume below |
| Pass B (ingest adapter, ADR 0017) | not started |
| Pass C (virtualize publication-table) | not started |
| Tracking task IDs | #9 durable · #10–13 Pass A |

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

- [ ] Add `drizzle-zod` (verify compat: `drizzle-orm@^0.45.2`,
      `zod@^4.4.3`. If zod-v4 incompat → keep hand-written zod, defer
      the derivation; the ADR's core value still holds).
- [ ] `validateBody(req, schema)` / `validateQuery(searchParams, schema)`
      in `lib/server/http.ts` → typed data or structured 400 (mirror
      the existing `flag/route.ts` pattern; uses `apiError`).
- [ ] Derive table-shaped schemas via `drizzle-zod` in
      `lib/shared/schemas.ts`; keep action-payload schemas hand-written.
- [ ] Apply to mutations first (`auth/gate`, `publications/[id]/decision`
      already zod, DRY via helper; `press-releases/promote-status`),
      then the ~12 input GET/export routes. Derive query schemas from
      *actual current client usage* (don't over-tighten).
- [ ] Vitest per new schema.
- [ ] Verify protocol (below) → commit → push → flip ADR 0018 stays
      `accepted`.

## Pass B: Ingest source-adapter  (ADR 0017)

- [ ] ADR 0017 → `accepted` once interface is final.
- [ ] `CanonicalPublication` + related DTOs (orgunit/extunit/person/
      person_publication/lookups).
- [ ] `SourceAdapter` iface: `name`, `fetch()`, `normalize(raw)→Canonical[]`.
- [ ] TS loader (Drizzle, not raw SQL): idempotent upsert by
      `webdb_uid` + DOI extract (`scripts/lib/doi-extract.mjs`) +
      analysis preservation + orphan archival, faithful port of
      `scripts/webdb-import.mjs`.
- [ ] WebDB = adapter #1. Pure = future, out of scope.
- [ ] Parity gate: old vs new vs **local DB** (canonical), diff row
      counts + analysis fields before any prod ETL.

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

## RESUME after `/clear`  (paste this)

> Lies `docs/LIBS_CLEANUP_PLAN_2026-05-17.md` +
> `docs/adr/0018-input-validation-drizzle-zod.md` +
> `docs/adr/0017-source-adapter-boundary.md`. Durable Plan + ADRs +
> Deep-Link-Fix sind bereits committed/gepusht (siehe `git log`).
> Setze **Pass A** um (drizzle-zod + API-Edge-Validierung über die ~12
> input-lesenden zod=0 Routes; `validateBody`/`validateQuery`-Helper in
> `lib/server/http.ts`; Schemas in `lib/shared/schemas.ts` via
> drizzle-zod wo table-shaped, hand-written für action-payloads).
> Reihenfolge A→B→C. Halte das Verify/commit/push-Protokoll aus dem
> Plan-File exakt ein. Tasks #10–13.

Memory pointers: `pure_api_migration_planned.md`,
`production_db_safety.md`, `dark_mode_token_conventions.md`,
`command_palette_built.md`, `wsl2_oom_risk.md`,
`vercel_cli_workflow.md`.
