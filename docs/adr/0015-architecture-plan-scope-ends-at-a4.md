---
date: 2026-05-13
status: accepted
deciders: Phase-A5/A6 scope review (post-7142725)
supersedes: none
---

# 0015 — Architecture Hardening Plan ends at A4; A5/A6 are product-track

## Context

Pfad D (audit closeout 2026-05-13, commit `7142725`) wrote four ADRs
that codified *how* to build the Editorial Pipeline (A5) and Story
Bundles (A6) on top of the Architecture Hardening Plan. A scope review
immediately after the commit caught what the audit had not: A5 and A6
are not architecture-hardening — they are product features dressed as
plan phases. The signals:

- **A7/A2/A1/A4 changed no behavior.** Backfilled ADRs, repository
  layer, domain-module audit, RSC migration. Each was a refactor.
- **A5 would change the Press-Team contract.** New tables
  (`pitch_log`, `coverage`), new page (`/pipeline`), new state automaton.
  [ADR 0012](0012-pipeline-state-machine.md) makes `pitch_log` the
  canonical pipeline-state — that overrides the MeisterTask integration
  shipped 2026-04-30 (`memory/meistertask_integration.md`).
- **A6 would add a new triage surface.** `stories` /
  `publication_stories` tables, `/stories` + `/stories/[id]` pages,
  clustering pass over embeddings. Additive but product-shaping.
- **Source proposals are explicitly unapproved.**
  `memory/editorial_pipeline_proposal.md` and
  `memory/story_bundles_proposal.md` both carry `Status: Proposed
  2026-04-29, not approved` — Pfad-D audited technical coherence, not
  product-fit.

## Decision

The Architecture Hardening Plan
(`/home/mleihs/dev/oeaw-press-release/ARCHITECTURE_PLAN.md`) ends at
**Phase A4 (fully closed 2026-05-13)** plus the existing Cross-cutting
hardening items (Vitest, error-handling helper, env validation,
structured logging).

A5 and A6 are **removed from the plan** and reframed as product-track
initiatives. Resumption requires explicit Press-Team buy-in (A5; UX
commitment, possible workflow migration off MeisterTask) or product-
track approval (A6; new Editorial entity).

The four ADRs already in `docs/adr/` (0011-0014) are kept on disk:

- **[ADR 0011](0011-editorial-pipeline-before-stories.md) is
  deprecated.** Its decision (A5 before A6) is moot when neither phase
  is scheduled in the plan.
- **[ADR 0012](0012-pipeline-state-machine.md),
  [ADR 0013](0013-story-schema-cluster-first.md),
  [ADR 0014](0014-clustering-sql-pgvector-default.md) remain accepted.**
  Their technical content (schemas, clustering algorithm) stays the
  blueprint if/when A5/A6 are built as product initiatives.

## Consequences

- ✅ The "Architecture Hardening" label is honest again: refactoring
  scope, not feature scope.
- ✅ MeisterTask remains the canonical pipeline-state-of-truth — no
  silent dual-system risk from an unapproved migration.
- ✅ Technical work in 0012/0013/0014 is preserved as ready-to-use
  blueprints; the schema + algorithm decisions don't need to be redone
  when a product initiative starts.
- ⚠️ The "loop closes" benefit Pfad-D promised (Discover → Cluster →
  Pitch → Coverage → press_score iteration) does not materialize from
  this plan. If wanted, it ships from a separate product initiative.
- ↔️ The plan finishes sooner than the Pfad-D ~41-49h estimate would
  have implied. The honest residual is A4-done + Cross-cutting tasks.

## Alternatives considered

- **Build A5/A6 anyway, validate after MVP launch.** Rejected — the
  product surface (Press-Team workflow change, /pipeline as new
  state-of-truth) needs stakeholder validation before code, not after.
  Risk of building and discarding.
- **Drop A5, keep A6 in plan.** A6 is additive and avoids the
  MeisterTask conflict, so lower-risk. But still a new product surface
  (/stories, story-triage workflow) — inherits the same "architecture-
  hardening label is misleading" problem. Cleaner to ship both as
  product-track.
- **Build A5 narrow: Toolbar-only, no `/pipeline` page,
  `pitch_log` as audit-log next to MeisterTask (not canonical).**
  Considered as Option D in the scope review. Defers to a future
  product initiative — same outcome as this ADR, less ceremony.
  Recorded here as the most likely shape *if* A5 is later approved.

## References

- `ARCHITECTURE_PLAN.md` (§ "Out of scope: A5/A6 product-track")
- `memory/editorial_pipeline_proposal.md` (Status: Proposed, not approved)
- `memory/story_bundles_proposal.md` (Status: Proposed, not approved)
- `memory/meistertask_integration.md` (existing pipeline-state-of-truth)
- `memory/phaseA5A6_audit.md` (Pfad-D audit + this pivot)
- [ADR 0011](0011-editorial-pipeline-before-stories.md) (deprecated by this ADR)
- [ADR 0012](0012-pipeline-state-machine.md), [ADR 0013](0013-story-schema-cluster-first.md), [ADR 0014](0014-clustering-sql-pgvector-default.md) (technical blueprints preserved)
