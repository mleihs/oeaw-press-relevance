---
date: 2026-04-30
status: accepted
deciders: prod-rebuild session
supersedes: none
---

# 0007 — Local Supabase is canonical for analysis data; sync is local → prod

## Context

This is a single-user analyst tool. The ETL pulls a TYPO3 mysqldump into
the local Supabase instance; LLM analysis (press_score, reasoning,
pitch_suggestion, suggested_angle, haiku, dimension scores) is written
to **local** first. Pre-2026-04-30, production was a 33k-row flat-table
schema without junction tables; the ETL ran `TRUNCATE` + reload. Pointing
that ETL at prod would have erased hours of LLM output. Two databases,
no clear direction-of-truth.

## Decision

- **Local Supabase (ports 54421/54422) is the canonical source for
  analysis state.** Production is a deploy snapshot.
- **Sync direction is strictly local → prod**, via `pg_dump` + restore
  against the Session-Pooler URL.
- **ETL is non-destructive**: `scripts/webdb-import.mjs` uses
  `INSERT … ON CONFLICT (webdb_uid) DO UPDATE` with only
  WebDB-sourced columns in the update set. Analysis fields are absent
  from the update list, so they are never touched on UPDATE. Rows
  missing from the new dump are `archived=true`, not deleted.
- **Schema changes** flow local → prod via MCP `apply_migration`
  against the linked Supabase project; each application needs explicit
  user OK per turn.
- `scripts/webdb-import.mjs` refuses to run when `PG_DATABASE_URL`
  points at a non-`127.0.0.1` host.

## Consequences

- ✅ Hours of LLM scoring can't be wiped by an accidental prod-pointed
  ETL run.
- ✅ Direction-of-truth is unambiguous in incident response.
- ⚠️ The analyst must remember to dump-restore prod after large
  scoring batches; `webdb/status` route shows drift.
- ⚠️ Multi-user scenarios (two analysts on two laptops) would need a
  different model — explicitly out of scope.

## Alternatives considered

- **Prod canonical** — would invite direct Supabase Studio edits that
  bypass local audit; rejected.
- **Bidirectional sync** — conflict resolution on analysis fields is
  ambiguous; rejected.
- **Per-feature branching** — Supabase Branching is project-scoped and
  costs a paid tier; overkill for a single-user tool.

## References

- `memory/production_db_safety.md`
- `memory/prod_deployment_setup.md`
- `scripts/webdb-import.mjs`
- `docs/PROD_SETUP_PLAN.md`
