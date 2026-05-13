---
date: 2026-05-13
status: accepted
deciders: Phase-A5/A6 audit session
supersedes: none
---

# 0013 — Story schema: cluster-centric baseline, editorial fields deferred

> **Status note 2026-05-13 (post-commit `7142725`):** A6 moved out of
> Architecture Plan scope per
> [ADR 0015](0015-architecture-plan-scope-ends-at-a4.md). This ADR's
> technical content remains the blueprint if/when A6 is built as a
> product-track initiative.

## Context

Phase A6 has two competing schemas. `memory/story_bundles_proposal.md`
(2026-04-29) drafted an **editor-centric** schema (`pitch`, `haiku`,
`created_by → users(id)`, status `draft|ready|sent|archived`) optimized
for manual story-building. `ARCHITECTURE_PLAN.md` §A6 drafted a
**cluster-centric** schema (`centroid vector(768)`, `member_count`,
`confidence: auto|manual`, status `draft|pitched|published|archived`)
optimized for auto-clustering of the existing 768-dim SPECTER2
embeddings. Two products, one phase. `created_by` requires H8 Auth;
`pitch` overlaps with A5's `pitch_log`; `haiku` requires LLM
summary scope.

## Decision

A6 Phase 1 ships the **cluster-centric baseline** only:

```sql
CREATE TABLE stories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  summary      TEXT,                       -- neutral story description, NOT a press pitch
  status       TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','pitched','published','archived')),
  centroid     vector(768),
  member_count INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE publication_stories (
  publication_id UUID NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  story_id       UUID NOT NULL REFERENCES stories(id)       ON DELETE CASCADE,
  similarity     DOUBLE PRECISION NOT NULL,
  confidence     TEXT NOT NULL DEFAULT 'auto'
                   CHECK (confidence IN ('auto','manual')),
  PRIMARY KEY (publication_id, story_id)
);

CREATE INDEX stories_centroid_ivfflat
  ON stories USING ivfflat (centroid vector_cosine_ops);
```

**Deferred to Phase 2:** `pitch TEXT`, `haiku TEXT`, `created_by UUID
REFERENCES users(id)`. All three are additive `ALTER TABLE ... ADD
COLUMN` migrations — no schema break. Trigger for Phase 2 is the H8
Auth landing **plus** demonstrated editorial demand (i.e. the manual
title-editing UX in Phase 1 proves insufficient).

The story-level "Pitch all" action does **not** write to a `pitch`
column on `stories`. It creates N rows in `pitch_log` (one per member
pub) per [ADR 0012](0012-pipeline-state-machine.md). One source of
truth for "what's being pitched."

## Consequences

- ✅ Auto-clustering ships immediately; no Auth dependency on the
  critical path.
- ✅ Story state vs. pitch state stay separate — `stories.status`
  tracks the bundle's editorial lifecycle, `pitch_log.status` tracks
  per-pub workflow. No double-bookkeeping.
- ✅ Phase-2 expansion is additive; current rows take `NULL` for
  deferred columns transparently.
- ⚠️ Manual editorial workflow (custom pitch, haiku per story) lives
  in `pitch_log.notes` in Phase 1 — workable but limited.
- ↔️ `summary` is intentionally not a press pitch — naming carries
  the boundary. Editorial pitch lives in `pitch_log` or (Phase 2)
  `stories.pitch`.

## Alternatives considered

- **Ship the proposal schema as-is.** Forces H8 onto the A6 critical
  path and creates a `stories.pitch` ↔ `pitch_log.notes` duplication
  with no clear resolution. Rejected.
- **Merge `stories` + `pitch_log` into one table.** A story has 1..N
  pitches (one per member pub) — flattening loses that cardinality.
  Rejected.

## References

- `memory/story_bundles_proposal.md` (deferred fields; Phase-2 spec)
- `memory/phaseA5A6_audit.md` (schema-conflict resolution)
- [ADR 0011](0011-editorial-pipeline-before-stories.md) (A5 before A6)
- [ADR 0012](0012-pipeline-state-machine.md) (pitch_log = source of pitch truth)
- [ADR 0014](0014-clustering-sql-pgvector-default.md) (centroid producer)
- `ARCHITECTURE_PLAN.md` §A6 (Phase-1 / Phase-2 split)
