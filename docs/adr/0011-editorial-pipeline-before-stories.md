---
date: 2026-05-13
status: accepted
deciders: Phase-A5/A6 audit session
supersedes: none
---

# 0011 — Editorial pipeline (A5) ships before story bundles (A6)

## Context

`ARCHITECTURE_PLAN.md` originally sequenced `§A6` (story bundles) directly
after `§A4` (RSC). The post-A4 audit surfaced four conflicts with
`memory/story_bundles_proposal.md` — chief among them an explicit
warning the plan had silently dropped: *"Without #1 [editorial
pipeline], bundling just creates more orphan drafts. Order matters:
pipeline first, then bundles."* The same 2026-04-29 review named the
pipeline `editorial_pipeline_proposal.md` as the **Top-1** strategic
recommendation and stories as Top-2; the plan had inverted that.
Without the pipeline, the bundle action "Pitch all" has no destination
table — it can either fabricate one (own state machine on `stories`) or
silently log nothing.

## Decision

Insert a new **Phase A5 — Editorial Pipeline** between A4 and A6. The
plan reihenfolge becomes `7 → 2 → 1 → 4 → 5 → 6`. A5 ships
`pitch_log` + `coverage` (schema in [ADR 0012](0012-pipeline-state-machine.md)),
a `lib/server/pipeline/` domain, and the `/pipeline` page. A6 then
depends on A5 in one concrete way: the story-level "Pitch all" action
creates N `pitch_log` rows (one per member pub), so stories never
duplicate pipeline state.

## Consequences

- ✅ Closes the find→ship loop: Discover → Cluster (A6) → Pitch (A5) →
  Coverage (A5) → outcome signal feeds `press_score` iteration.
- ✅ A6 ships with a real destination for its bundle pitch action;
  no orphan drafts.
- ✅ A2/A1 skip-debts (embeddings repo per `repos/README.md`;
  `coverage/` domain per [ADR 0008](0008-domain-modules-deferred.md))
  get paid honestly when A6 lands on top of A5's pipeline rather than
  re-skipped.
- ⚠️ Total effort climbs from ~18h (A6 only, original plan) to
  ~41-49h (A5: ~15-20h + A6: ~22-25h). The audit reframes that as
  honest accounting, not new scope.
- ↔️ A6 ship-date moves out by the A5 duration. Accepted because
  shipping A6 against the original schema produces a feature
  press-team won't use (no pipeline destination).

## Alternatives considered

- **Ship A6 first, build A5 on top.** Would force the story page to
  carry an embedded pipeline state machine (status enum on `stories`
  + per-pub action history), which A5 would then have to migrate
  out. Net: ~5h extra at A5-time, plus a schema break. Rejected.
- **Skip A5 entirely; rely on MeisterTask push for pipeline state.**
  MT is the destination for individual pitches but doesn't model
  coverage outcomes or feed back into `press_score`. Rejected.

## References

- `memory/phaseA5A6_audit.md` (this decision's full audit log)
- `memory/editorial_pipeline_proposal.md` (Top-1 recommendation)
- `memory/story_bundles_proposal.md` ("pipeline first" cross-link)
- `ARCHITECTURE_PLAN.md` §A5 (new), §A6 (voraussetzungen updated)
- [ADR 0012](0012-pipeline-state-machine.md), [ADR 0013](0013-story-schema-cluster-first.md), [ADR 0014](0014-clustering-sql-pgvector-default.md)
