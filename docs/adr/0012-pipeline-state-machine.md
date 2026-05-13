---
date: 2026-05-13
status: accepted
deciders: Phase-A5/A6 audit session
supersedes: none
---

# 0012 — Editorial pipeline state machine: `pitch_log` + `coverage`

## Context

Phase A5 ([ADR 0011](0011-editorial-pipeline-before-stories.md))
needs two persistent surfaces: one for press-team workflow state per
publication, one for outcome tracking. Today the find→ship loop ends
at scoring — what got pitched, where it ran, how it landed are all
invisible to the tool and unavailable to `press_score` iteration. The
proposal in `memory/editorial_pipeline_proposal.md` predates the
A4-era `users` stub work; the stub (`supabase/migrations/20260429000004_users_stub.sql`)
exists with role-check `admin|editor|viewer` and `idx_users_email`,
but H8 (Auth UI) is not wired and zero TS code reads `users.id`.

## Decision

One new migration introduces two tables:

```sql
CREATE TABLE pitch_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id    UUID NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  status            TEXT NOT NULL CHECK (status IN ('backlog','pitching','covered','archived')),
  assignee_id       UUID REFERENCES users(id),  -- NULLABLE: A8/Auth not required for A5
  notes             TEXT,
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE coverage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id  UUID NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  outlet          TEXT NOT NULL,
  headline        TEXT,
  url             TEXT,
  published_at    DATE,
  sentiment       TEXT CHECK (sentiment IN ('positive','neutral','critical')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Hosting: `lib/server/pipeline/` is the new domain home — re-opens
[ADR 0008](0008-domain-modules-deferred.md) for `pipeline/` because A5
produces a concrete smell (two repos + cross-feature transitions), not
because the original skip rationale was wrong. `status_changed_at`
is written by the repo on every status mutation, not by trigger — keeps
the write site explicit and testable.

## Consequences

- ✅ Press-team workflow becomes a first-class entity; Kanban view at
  `/pipeline` is a thin read against `pitch_log`.
- ✅ Coverage data is the first real outcome signal for
  `press_score` iteration — feeds `memory/press_score_alignment_finding.md`.
- ✅ `created_by` was deliberately omitted; `assignee_id` is the only
  user-FK and is nullable. When H8 lands, populating it is additive
  (no schema break, no backfill).
- ⚠️ Two tables, two repos, ~6 routes, one new page. Effort ~15-20h
  per the audit.
- ⚠️ Assignee-filter UI is hollow until H8 — UX must default to
  "unassigned"/"all" not a person picker.
- ↔️ [ADR 0008](0008-domain-modules-deferred.md) is **opened**, not
  contradicted: the original skip was correct on 2026-05-12 evidence;
  A5 is the documented re-open trigger.

## Alternatives considered

- **MeisterTask as system of record.** MT push exists but doesn't
  expose coverage outcomes or queryable status history; rejected.
- **Single `pitch_log` with embedded coverage fields.** Couples the
  "what we're trying" to "what landed where" and forbids 1-pub →
  N-coverage (a paper can get covered in multiple outlets). Rejected.

## References

- `memory/editorial_pipeline_proposal.md`
- `supabase/migrations/20260429000004_users_stub.sql`
- [ADR 0008](0008-domain-modules-deferred.md) (pipeline/ re-opened by A5)
- [ADR 0011](0011-editorial-pipeline-before-stories.md) (parent decision)
- `ARCHITECTURE_PLAN.md` §A5
