---
date: 2026-05-12
status: accepted
deciders: Phase-A4 pilot session
supersedes: none
---

# 0009 — Server-Components fetch through `lib/server/*`; force-dynamic default

## Context

Phase-A4's RSC pilot (`/persons/[id]`) needed to replace a client-side
`useApiQuery` → API → SQL-function roundtrip with a direct server call.
Two coupled constraints blocked the obvious approach: (a) eslint
boundaries forbade `app-pages → lib/server/**` (ADR 0006, written when
every page was `'use client'`); (b) TanStack-Query SSR hydration via
`dehydrate`/`HydrationBoundary` was an open question — only required
when the client mutates the prefetched cache, which the pilot does not.

## Decision

1. **Boundaries amended:** `app-pages → server` now allowed. Server-only
   bundle leaks are still caught at build time by Next.js's
   `'use client'` boundary + Webpack server-only resolution for
   `postgres`/`crypto`. The lint rule was convenience, not the only stop.
2. **RSC pages call `lib/server/<feature>/<name>.ts` directly.** No new
   fetch pattern. SQL-function wrappers (ADR 0005) live next to their
   feature, mirroring `lib/server/repos/publications.ts`.
3. **`force-dynamic` default** for read-heavy RSC pilots: auth-gated,
   `since=YYYY-MM-DD`-parametrised pages don't benefit enough from ISR
   to justify stale-snapshot surprises. ISR tuning is per-page follow-up.
4. **Props, not dehydrate**, when the page neither refetches nor mutates
   the data. `dehydrate`/`HydrationBoundary` is reserved for pages where
   a client `useApiQuery` or mutation needs the cache prepopulated.

## Consequences

- ✅ One fewer roundtrip on first paint; no `"Lade …"` flicker.
- ✅ HTML embeds data → preview-sharing + SEO viable.
- ⚠️ Discipline shifts to file level: `'use client'` pages MUST NOT
  import `@/lib/server/*`; reviewer + Webpack build break are the guards.
- ↔️ No edge cache with `force-dynamic`. Acceptable for an internal tool;
  revisit at >100 req/min on a single page.

## Alternatives considered

- **Always dehydrate.** Heavier setup, zero win for pages without refetch — kept as escape hatch only.
- **Per-file `// eslint-disable`.** Hides the shift; rejected.
- **`revalidate=N` default.** `since` parameter makes ISR-staleness surprising; rejected.

## References

- `ARCHITECTURE_PLAN.md` §A4 (Open Questions)
- `eslint.config.mjs` (`app-pages → server` rule)
- `lib/server/researchers/detail.ts`, `app/persons/[id]/page.tsx`
- `app/researchers/page.tsx` — the canonical decision-#4 escape hatch:
  a `'use client'` page that keeps client `useApiQuery` (not RSC first-paint)
  because the leaderboard + beeswarm distribution re-filter interactively via
  nuqs query-state (`?view=…&since=…`). RSC first-paint would buy nothing —
  the very next filter change refetches client-side.
- ADR 0005, ADR 0006 (the one this amends)
- [ADR 0010](0010-rsc-mutation-router-refresh.md) extends decision #4
  with the mutation pattern (`invalidateQueries` + `router.refresh()`)
  introduced on `/publications/[id]` in Phase-A4 phase 1.
