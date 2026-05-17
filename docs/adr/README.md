# Architectural Decision Records

Lightweight ADRs (MADR-style) capturing the load-bearing decisions of
this codebase. The goal: a future contributor reading the code can find
the *why* without spelunking through commit messages and memory files.

## Conventions

- **One decision per file.** If a file would hold two, split it.
- **MADR-style frontmatter** (`date`, `status`, `deciders`, `supersedes`).
  See `0000-template.md`.
- **Filename**: `NNNN-short-title-in-kebab-case.md`. NNNN is monotonic;
  do not reuse numbers, even for retired ADRs.
- **Keep each ADR under ~50 lines.** If it grows beyond, the decision
  is probably two decisions in disguise.
- **Statuses**:
  - `proposed` — under discussion, not yet binding
  - `accepted` — load-bearing, follow it
  - `superseded` — replaced by a later ADR; leave the file in place and
    set `supersedes: NNNN` on the new one
  - `deprecated` — no longer applies, but the historical reasoning is
    still useful (e.g. when an external constraint disappeared)
- **References, not duplication.** Link to commits, files, or
  `memory/*.md` rather than rewriting the rationale.

## Index

| #    | Title | Status |
|------|-------|--------|
| 0000 | [Template](0000-template.md) | — |
| 0001 | [Drizzle ORM over Prisma and raw Supabase-JS](0001-drizzle-over-prisma-and-raw-sql.md) | accepted |
| 0002 | [Supabase-JS only for Auth / Realtime / RPC / Storage](0002-supabase-js-only-for-auth-realtime.md) | accepted |
| 0003 | [Per-feature `toApi()` mapper, not a generic serializer](0003-per-feature-toapi-not-generic-serializer.md) | accepted |
| 0004 | [Wire shape stays snake_case + ISO-8601](0004-snake-case-iso-8601-wire-shape.md) | accepted |
| 0005 | [Aggregation SQL functions stay in Postgres](0005-sql-functions-stay-in-postgres.md) | accepted |
| 0006 | [`lib/{server,shared,client}` boundaries enforced by eslint](0006-lib-server-shared-client-boundaries.md) | accepted |
| 0007 | [Local Supabase is canonical for analysis data](0007-local-canonical-for-analysis-data.md) | accepted |
| 0008 | [Domain-modules (`triage/`, `pipeline/`, `coverage/`) deferred](0008-domain-modules-deferred.md) | accepted |
| 0009 | [Server-Components fetch through `lib/server/*`; force-dynamic default](0009-rsc-server-components-pilot.md) | accepted |
| 0010 | [RSC mutation flow: invalidate + `router.refresh()`](0010-rsc-mutation-router-refresh.md) | accepted |
| 0011 | [Editorial pipeline (A5) ships before story bundles (A6)](0011-editorial-pipeline-before-stories.md) | deprecated |
| 0012 | [Editorial pipeline state machine: `pitch_log` + `coverage`](0012-pipeline-state-machine.md) | accepted |
| 0013 | [Story schema: cluster-centric baseline, editorial fields deferred](0013-story-schema-cluster-first.md) | accepted |
| 0014 | [Story clustering: SQL pgvector-DBSCAN default](0014-clustering-sql-pgvector-default.md) | accepted |
| 0015 | [Architecture Plan ends at A4; A5/A6 are product-track](0015-architecture-plan-scope-ends-at-a4.md) | accepted |
| 0016 | [Command palette + global keyboard layer (cmdk, 0-dep matcher)](0016-command-palette-keyboard-layer.md) | accepted |

## When to write an ADR

Write one when:

- You are about to make a choice that will be load-bearing for the next
  6+ months and reversing it would cost > a day of work.
- You catch yourself explaining the same decision twice on a code
  review or in chat.
- A future contributor would otherwise have to grep commit messages or
  memory files to reconstruct the *why*.

Don't write one when:

- The decision is local to one file and will be apparent on reading it.
- The decision is reversed by the next refactor — that's a tactical
  call, not architecture.
- The rationale is captured by a test (the test is the artifact).
