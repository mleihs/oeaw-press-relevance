# Audit-Fix Progress (whole-app audit 2026-06-15)

**Purpose:** durable checkpoint for the "fix everything" pass following the super-deep
whole-app audit. After a `/clear`, say **"resume audit fixes"** and continue from the first
unchecked box. Keep this file updated as the source of truth (check boxes, add notes).

Working branch for Vercel: `main`. VPS branch: `chore/coolify-dockerfile` (merge `main` in).
Deploy procedure (only when a batch is verified): see bottom.

Verify after each batch: `npm run typecheck && npm run lint && npm test` (and `npm run build`
before deploy). Migrations: apply to LOCAL first, then PROD via psql to `PROD_DB_URL_POOLER`.

---

## Batch 1 — safe app-wide config / global UI (low risk) ✅ DONE (verified typecheck+lint)
- [x] `next.config.ts`: add `radix-ui`, `recharts` to `optimizePackageImports`
- [x] `next.config.ts`: add `headers()` — CSP (frame-ancestors/object-src/base-uri/form-action),
      X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy, HSTS
- [x] `app/layout.tsx`: wrap body in `<MotionConfig reducedMotion="user">` (motion/react)
- [x] `app/globals.css`: global reduced-motion reset (animation/transition near-zero under reduce)
- [x] `components/ui/tooltip.tsx`: `bg-popover text-popover-foreground` (dark-mode tokens)

## Batch 2 — security ✅ DONE (334 tests pass, 0 lint errors)
- [x] Migration `20260615000003_rls_sensitive_tables.sql`: ENABLE RLS (no anon policy = deny) on
      the 14 unpoliced tables. App uses postgres/owner role (bypasses RLS) → safe. **Local apply
      pending** (supabase not running) → applies at deploy via prod psql + next `db reset`.
      TODO at deploy: confirm via Supabase security advisor.
- [x] `app/api/meistertask/push/route.ts`: `assertAllowedOrigin(req.nextUrl.origin)` (L1)
- [x] `app/api/sessions/[id]/finish/route.ts`: `validateParams(idParamSchema)` (L5)
- [x] `app/api/social/image/[id]/route.ts`: https + cdninstagram/fbcdn host allow-list (L3)
- [x] `lib/server/enrichment/pdf-extract.ts`: http(s)-only + literal private-IP/loopback block (L2)
- [x] `npm audit fix` (no --force): 10→6; remaining 6 need --force (would downgrade Next to a
      canary for a postcss build-chain CVE) → left intentionally. package.json unchanged.
- [~] **Anon-key (H1 part b) — DEFERRED, needs USER/infra action.** Confirmed BOTH
      `getSupabaseFromRequest` and `getSupabaseAdmin` are DEAD CODE (zero call sites) — the anon
      key is entirely unused; the app uses Drizzle/DATABASE_URL only. The RLS migration above
      neutralizes the actual data-exposure risk. Remaining hygiene the user should do:
      (1) on Vercel + Coolify, rename `NEXT_PUBLIC_SUPABASE_ANON_KEY` → `SUPABASE_ANON_KEY`
      (code already prefers the non-public name); (2) rotate the anon key; (3) rotate the
      compromised Apify token. NOT done in code to avoid breaking prod env validation blind.

## Batch 3 — performance ✅ DONE (typecheck+lint+build pass)
- [x] dashboard orphans: new `countOrphans()` `count(*)` query; dashboard uses it instead of
      fetching every orphan row (`lib/server/press-releases/list.ts` + `dashboard/fetch.ts`)
- [x] dashboard: `unstable_cache(60s)` on the 4 param-independent aggregates (stats, scatter,
      period counts, webdb-as-of); fixed the misleading "PG-cached" comment (`app/page.tsx`)
- [x] lazy-load ALL three recharts charts (scatter + distribution + radar) via `next/dynamic`
      (a static import of any one pulled recharts into the initial bundle); scatter query bounded
      `ORDER BY random() LIMIT 4000`
- [x] per-route `loading.tsx`: publications, social, events, press-releases (persons = detail-only;
      researchers handled in Batch 4 SSR conversion)
- [~] paginate press-releases & events lists — DEFERRED: needs pagination UI + product decision
      on hiding older rows; the orphans full-fetch (the worst case) is already fixed above.

## Batch 4 — accessibility (feature-specific)
- [ ] `components/ui/virtualized-multi-select.tsx`: keyboard-operable options (H1)
- [ ] `components/publication-table.tsx`: row-expand via real button + aria-expanded (H2)
- [ ] `app/researchers/_components/leaderboard-table.tsx`: fix invalid ARIA table → semantic list (H3)
- [ ] researchers: surface fetch error + add `researchers/error.tsx` (H4)
- [ ] researchers: SSR shell + metadata (convert client page → RSC + island) (H5)
- [ ] beeswarm keyboard activation: router instead of `window.location.href` (H6)
- [ ] tables: `<caption class=sr-only>` + `scope` (events, press-releases, dashboard averages) (M5)
- [ ] `generateMetadata` on `[id]` detail routes (publications, persons, events) (M6)
- [ ] `dimensions-radar`: SR alt + keyboard sort + tokens (M4)
- [ ] social refresh-button: AbortController on dialog close (M8)
- [ ] preset-bar / filter-sheet ARIA (aria-pressed / radiogroup) (M10)
- [ ] (lower) error.tsx `reset()`, index keys, title-only semantics, contrast tweaks

## Batch 5 — testing
- [ ] `lib/server/openrouter.test.ts` — isFatalLlmError, estimateCost, 402 back-off, checkKeyBalance
- [ ] gate auth tests — extract+test `timingSafePasswordMatch` + proxy `isPublic` decision matrix
- [ ] batch orchestrator + `upsertBatch` tests (export `cleanKeywords` etc.)
- [ ] add `@vitest/coverage-v8` + coverage script; run Playwright e2e in CI

## Batch 6 — architecture / docs / help
- [ ] fix `ARCHITECTURE.md` Folder Structure + Key Abstractions (stale lib/* paths)
- [ ] add ADR-0019 row to `docs/adr/README.md` index
- [ ] schema-drift CI check (every migration table/column appears in schema.ts)
- [ ] move completed root/`docs/` plan files to `docs/archive/`
- [ ] **update help content** (`content/help/**`) + dashboard "Was ist neu" changelog for any
      user-visible changes from these fixes; verify help meta.json + em-dash gate

---

## Deploy procedure (per verified batch / at end)
1. `npm run typecheck && npm run lint && npm test && npm run build`
2. Commit on `main`. Push.
3. Vercel: `vercel deploy --prod --yes`
4. VPS: merge `main` → `chore/coolify-dockerfile`; SSH tunnel `:8088`; Coolify API deploy
   uuid `cbt2tdcwf10ia0prqk8r45bm`.
5. Prod migration (Batch 2) FIRST: psql `/opt/homebrew/opt/libpq/bin/psql "$PROD_DB_URL_POOLER"`.
6. Liveness: 307 (gate redirect) on both targets.

## Standing non-code item
- Rotate the compromised Apify token (user's call).
</content>
</invoke>
