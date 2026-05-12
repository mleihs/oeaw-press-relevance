---
date: 2026-05-12
status: accepted
deciders: Phase-A1 audit session
supersedes: none
---

# 0008 — Domain-modules (`triage/`, `pipeline/`, `coverage/`) deferred

## Context

`ARCHITECTURE_PLAN.md` Phase A1 proposed three new `lib/server/`
namespaces for "cross-feature operations spanning 3+ files". The
plan predates Phase-3 closeout and Phase-A2 (commits `c503426`,
`c8904cd`); a fresh audit found the fan-out it anticipated no longer
exists.

## Decision

Stay flat at the feature level. Per-domain rationale:

- **`triage/` skipped.** `publications/decisions.ts::applyDecision`
  already orchestrates `repo.updateDecision` + MT-push; route is 36
  LOC. Session lazy-create is client-side by design (per-tab
  localStorage); moving it server-side needs cookie-based IDs — an
  architectural shift, not a refactor. `meistertask/push.ts` is also
  called by the manual `/api/meistertask/push` route, so it belongs
  in `meistertask/`, not a triage subfolder.

- **`pipeline/` skipped.** Pipeline status is already a typed union
  (`lib/shared/types.ts`). A proposed `transitionPub(id, target)`
  would splice each write into two queries (status + result fields)
  or duplicate every `db.update().set({...})` — both worse than the
  current inline writes. No invalid-transition bug exists.

- **`coverage/` skipped.** `promote_press_release_orphans_logged()`
  is a SQL function (ADR 0005). The two callers
  (`scripts/webdb-import.mjs`, `scripts/enrich-orphans.ts`) use raw
  `pg.Client`, can't import `lib/server/` (would mix two Postgres
  clients in one process). No admin route exists; a TS wrapper would
  have zero consumers.

## Consequences

- ✅ No hollow modules; layout matches actual ontology.
- ✅ Follows Phase-A2's maxim: never extract for symmetry alone.
- ⚠️ A future smell (second TS caller for promote, invalid-transition
  bug, server-side sessions) re-opens this — supersede then, don't
  quietly bypass.

## References

- `ARCHITECTURE_PLAN.md` §A1 (Acceptance updated alongside)
- `memory/phaseA2_handover.md` Lesson #1
- `lib/server/repos/README.md` — same pattern of entity-by-entity skip
