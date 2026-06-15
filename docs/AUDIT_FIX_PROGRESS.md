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

## Batch 4 — accessibility ✅ DONE (typecheck+lint+test pass)
- [x] `virtualized-multi-select.tsx`: rows are real `<button aria-pressed>` (keyboard-native) (H1)
- [x] `publication-table.tsx`: chevron is the real toggle + aria-expanded/aria-label (H2)
- [x] `leaderboard-table.tsx`: invalid ARIA grid → semantic list of links (H3)
- [x] researchers: surface fetch error (role=alert) + `researchers/error.tsx` w/ reset (H4)
- [x] researchers: server `layout.tsx` w/ metadata (H5 metadata part; full client→RSC data
      conversion DEFERRED — large rewrite, marginal benefit on a gated internal tool)
- [x] beeswarm keyboard activation: `router.push` instead of `window.location.href` (H6)
- [x] tables: `<caption class=sr-only>` + `scope=col` (events, press-releases) (M5)
- [x] `generateMetadata` on `[id]` detail routes (publications, persons, events), React.cache-deduped (M6)
- [x] `dimensions-radar`: sr-only data table + keyboard-operable axis ticks + token colors (M4)
- [x] social refresh-button: AbortController (abort on close/unmount) + consumeSSE releaseLock (M8)
- [x] preset-bar → role=group + aria-pressed; filter-sheet TriStateTabs/ToggleChip aria-pressed (M10)
- [x] error.tsx `reset()` wired (publications, press-releases, researchers) via ApiErrorCard action
- [~] (lower) remaining contrast/index-key/title-only nits — left; cosmetic, not WCAG-blocking

## Batch 5 — testing ✅ DONE (365 tests pass; +31 new)
- [x] `lib/server/openrouter.test.ts` (21 tests) — estimateCost, isFatalLlmError, parseJsonContent,
      chatCompletionJson 402 back-off + error paths, checkKeyBalance budget precedence
- [x] gate auth: extracted crypto → `lib/server/gate.ts`, paths → `lib/shared/gate.ts` (Edge-safe);
      `gate.test.ts` (10 tests) covers tokenize, timingSafePasswordMatch, isPublicGatePath matrix
- [x] `@vitest/coverage-v8` + `test:coverage` script + vitest coverage config; CI test step now
      runs coverage (baseline ~19% stmts, measurement-only, no threshold)
- [~] batch orchestrator + `upsertBatch` tests — DEFERRED (MED): need DB-seam mock scaffolding;
      the two HIGH money/auth gaps are closed. Good follow-up.
- [~] Playwright e2e in CI — DEFERRED: needs DB + GATE_* secrets + browser install in CI;
      high flake risk. Run locally (`npx playwright test`); wire as a nightly later.

## Batch 6 — architecture / docs / help ✅ DONE (full gate green incl. build)
- [x] `ARCHITECTURE.md`: rewrote the `lib/` tree to the real server/shared/client layout +
      replaced the "Phase 2 future" note with the ESLint-boundary reality (ADR 0006); fixed all
      stale inline `lib/*.ts` path refs (meistertask/push, types, explanations, use-api-query, query-keys)
- [x] ADR-0019 row added to `docs/adr/README.md` index
- [x] schema-drift CI check: `scripts/check-schema-drift.mjs` + `npm run check-schema-drift` +
      CI step (passes: 34/34 live migration tables in schema.ts)
- [x] **help/changelog**: added "Barrierefreiheit, Sicherheit & Tempo" entry to the in-app
      "Was ist neu" + bumped `changelogLastUpdated`. Help articles describe workflows/features
      unchanged by these fixes, so verified-current (em-dash gate green)
- [~] move completed plan files to `docs/archive/` — SKIPPED (cosmetic; risks breaking doc links)

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
