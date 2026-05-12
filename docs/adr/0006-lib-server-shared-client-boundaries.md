---
date: 2026-05-11
status: accepted
deciders: Phase-2 reorg session
supersedes: none
---

# 0006 — `lib/{server,shared,client}` boundaries enforced by eslint

## Context

Pre-Phase-2, `lib/` was a flat dump (`lib/scoring.ts`, `lib/types.ts`,
`lib/api-helpers.ts`, …). Some files were import-safe from Server
Components, others would have leaked Node-only deps (`postgres`,
`crypto.createHash`) into the client bundle. Bundle audits caught two
such leaks during waves A–H. There was no mechanical guard, so a
contributor adding a hook in `lib/api-helpers.ts` would not learn it had
a server-side dependency until the build broke.

## Decision

Three top-level lib namespaces with **explicitly enforced import
boundaries**:

- `lib/shared/**` — pure data + types + framework-agnostic helpers; no
  runtime deps; importable from anywhere.
- `lib/server/**` — Drizzle, Supabase-JS helpers, OpenRouter,
  MeisterTask, env-bound secrets; **never** imported from `lib/client`,
  `components/**`, or `app/**` page components.
- `lib/client/**` — React hooks, browser-only utilities, nuqs adapters.

Enforced by `eslint-plugin-boundaries` v6 in `eslint.config.mjs` with
`default: "disallow"` (every cross-element import must appear on the
allow-list) at `level: "error"`. The only bridge from `app/api/**` to
`lib/server/**` is the api-routes element; client elements get nothing
from server.

## Consequences

- ✅ Bundle leaks are caught at lint time, before they hit a PR review.
- ✅ Phase 3 could trust that any `lib/server/<feature>` file was safe
  to import from `app/api/**` without checking what it pulled in.
- ⚠️ New top-level directories (e.g. `lib/jobs/`) need an entry in the
  `boundaries/elements` array; until added, their imports are
  unchecked.
- ⚠️ Plugin v6 still uses string selectors (object form is documented
  but not yet schema-validated); see the comment block above the
  config.

## Alternatives considered

- **Lint-by-convention** — pre-Phase-2 status quo; audit waves showed
  regressions land.
- **TypeScript project references** — heavier build setup, slower
  IDE; rejected.

## References

- `eslint.config.mjs` (lines 50–108)
- `OSS_READINESS_PLAN.md` §6.3
- Phase-2 closeout: 2026-05-11 (16 commits on `refactor/drizzle-press-releases`)
