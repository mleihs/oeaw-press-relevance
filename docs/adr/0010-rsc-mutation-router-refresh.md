---
date: 2026-05-12
status: accepted
deciders: Phase-A4 phase-1 session
supersedes: none
---

# 0010 — Mutating components in RSC pages: invalidate cache AND `router.refresh()`

## Context

Phase-A4's first phase-1 page (`/publications/[id]`) migrated to a Server
Component fed by props — per [ADR 0009](0009-rsc-server-components-pilot.md),
"props, not dehydrate." Unlike the pilot (`/persons/[id]`, read-only), this
page hosts the `DecisionToolbar` and `PublicationFlag` — both mutate the
publication row that the RSC just rendered. Before this ADR, both
components only called `queryClient.invalidateQueries(...)`. That works
when the page renders the pub through `useApiQuery` (the cache miss
triggers a refetch). After ADR 0009 there is no `useApiQuery` for the
page data anymore; invalidation alone leaves the rendered tree stale
until full reload.

The open question on [ADR 0009](0009-rsc-server-components-pilot.md)
was: do we (a) keep props and add a server-trip refresh, or (b) reach
for `HydrationBoundary` to keep TanStack-Query as the single mutation
audience? This ADR closes that.

## Decision

Mutation components used inside RSC pages call **both**
`queryClient.invalidateQueries(...)` AND `router.refresh()` on success.
The refresh is the load-bearing step for RSC consumers; cache
invalidation stays so that legacy client-rendered surfaces
(`/review`, `/publications` list, `/` dashboard) still update through
their `useApiQuery` cache keys. Both are idempotent — `router.refresh()`
is essentially a no-op on routes whose tree contains no Server-Component
data segment.

Concretely, today's `DecisionToolbar.onSuccess` and the two mutations in
`PublicationFlag` (`save`, `remove`) both invalidate the publications-
list / queue / detail keys **and** call `router.refresh()`. The
`MeistertaskButton` remains untouched: its mutation drives the local
`idle → pushing → pushed | idle` state machine of its own button, and
the page-level pub row's `meistertask_task_id` is not read elsewhere
on the same page.

## Consequences

- ✅ One mutation flow, two audiences. RSC pages stay prop-fed (no
  `HydrationBoundary` setup); client pages keep their cache invalidation
  exactly as before.
- ✅ Component re-renders preserve client local state (toolbar's
  `rationale` draft, popover open state, etc.) because Next 16's
  `router.refresh()` re-renders Server Components while reconciling
  the existing client tree.
- ⚠️ A future mutation surface added on a different feature must
  remember the same pattern. Mitigated by inline comments at both
  call sites pointing back to this ADR.
- ⚠️ `router.refresh()` triggers a Server-Component re-render even on
  fully-client routes (still cheap — the route layout is static here
  and no page-level RSC data fetch happens). Not measurable in dev;
  revisit if production observability shows redundant server work on
  mutation-heavy client pages.

## Alternatives considered

- **`HydrationBoundary` + dehydrate.** Would have required a per-page
  server-side `getQueryClient()`, a `prefetchQuery` with the same
  `QK.publication(id)` key the toolbar invalidates, and a
  `HydrationBoundary` wrapper. Heavier setup; zero gain over a
  `router.refresh()` for pages that don't refetch the prefetched cache
  outside the mutation flow. Rejected.
- **Only `router.refresh()`, drop the cache invalidation.** Would
  silently break `/review` and the publications-list staleness — those
  pages still read through `useApiQuery`. Rejected.
- **Per-mutation callback prop** (e.g. `onSuccess?: (data) => void`).
  Pushes the choice onto every parent; defeats the point of a shared
  toolbar. Rejected.

## References

- `components/decision-toolbar.tsx` (onSuccess, router.refresh call)
- `components/publication-flag.tsx` (save + remove onSuccess)
- `app/publications/[id]/page.tsx` (RSC consumer)
- [ADR 0009](0009-rsc-server-components-pilot.md) (open question this answers)
