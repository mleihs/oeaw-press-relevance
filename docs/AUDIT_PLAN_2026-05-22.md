# Code-Cleanliness Audit & Fix Plan — 2026-05-22

Triggered by: the `SELECT *` Postgres view `press_eligible_publications` made a
publications column drop brittle. A full code-cleanliness scan followed.

**Verdict:** well-maintained codebase — `SELECT *` is essentially a one-off, no
high-severity issues. The 5 fixes below are all approved ("ja alles"). Execute
them, verify, commit, push. Commit this doc alongside the fixes as the audit record.

## Environment

- Repo: `/Users/mleihs/Dev/oeaw-press-relevance` — Next.js 16 + Drizzle ORM +
  Supabase/Postgres. CI gate: `npm run typecheck && npm run lint && npm test` (Node 24).
- Local Postgres: container from `docker ps | grep supabase_db` (e.g.
  `supabase_db_oeaw-press-release`). `docker exec -i <c> psql -U postgres -d postgres`.
- Prod Postgres: pooler URL —
  `grep '^PROD_DB_URL_POOLER=' ~/.config/oeaw-press-release/prod-credentials | cut -d= -f2-`.
  Reach it from inside the local container: `docker exec -i <c> psql "<pooler-url>"`.
- Pooler enforces a statement_timeout; for long ops pipe SQL via a `<<'SQL'` heredoc
  with `SET statement_timeout = 0;` first (not `psql -c`).
- After code changes: run the CI gate locally, then `git commit` + `git push origin main`
  (Vercel auto-deploys; CI re-runs). Note: commits go out with a hostname git email —
  cosmetic, ignore.

## Fix 1 — narrow `press_eligible_publications` (DB migration, no app code)

The view is `SELECT * FROM publications WHERE <5 clauses>`. Its only consumers — the
`publication_period_counts(date,date,date)` SQL function and `scripts/smoke/eligibility.ts`
— only `count(*)` and filter on `published_at`; they read no other column. The `SELECT *`
is the sole reason a publications column drop needs a DROP/recreate of this view.

1. Re-verify the consumers touch only `id`/`published_at`: read `scripts/smoke/eligibility.ts`
   and the `publication_period_counts` body in
   `supabase/migrations/20260516000002_press_eligibility_canonical.sql`. If anything else
   is read, add that column to the SELECT below.
2. Create `supabase/migrations/20260522000002_press_eligible_publications_narrow.sql`:
   ```sql
   -- Narrow press_eligible_publications from SELECT * to SELECT id, published_at.
   -- Consumers (publication_period_counts, the eligibility smoke) only count rows
   -- and filter on published_at. SELECT * coupled the view to every publications
   -- column — a column drop needed DROP/recreate (see 20260522000001). This decouples it.
   BEGIN;
   DROP VIEW press_eligible_publications;
   CREATE VIEW press_eligible_publications AS
     SELECT id, published_at
     FROM publications
     WHERE archived = false
       AND analysis_status = 'analyzed'
       AND is_ita_subtree = false
       AND popular_science = false
       AND publication_type_id NOT IN (SELECT id FROM ineligible_publication_types);
   COMMENT ON VIEW press_eligible_publications IS
     'THE canonical press-pitch eligibility relation: analyzed, not archived, not ITA-subtree, not pop-science, eligible type. Mirrors lib/server/publications/list.ts buildWhere; parity pinned by the dashboard smoke.';
   COMMIT;
   ```
3. Apply that SQL to **prod AND local** via psql. DB-only — no Vercel deploy needed.

## Fix 2 — delete dead exports (`lib/shared/constants.ts`)

`PUBLICATION_TYPE_MAP`, `OA_TRUE_VALUES`, `OA_FALSE_VALUES` have zero consumers.
Re-grep the repo to confirm (only the declaration lines should match), then delete
the three exports. `tsc` confirms nothing breaks.

## Fix 3 — three API routes → `validateBody()`

`lib/server/http.ts` exports `validateBody()` — the canonical body-parse + zod-validate
helper (ADR 0018). Replace the hand-rolled `req.json()` + `safeParse` block in:
- `app/api/analysis/batch/route.ts`
- `app/api/enrichment/batch/route.ts`
- `app/api/sessions/[id]/finish/route.ts`

Read `validateBody`'s signature first; keep each route's behaviour identical.
Leave `app/api/meistertask/.../push` — it deliberately 400s instead of {}-fallback.

## Fix 4 — refactor `runEnrichmentBatch` (`lib/server/enrichment/batch.ts`)

~416-line function. The per-source result-merge block (keywords / journal /
full_text_snippet longest-wins / pdf_url / word_count / published_at) is copy-pasted
across the PRE_PDF and POST_PDF loops; the PDF-extract block appears 3×. Extract:
- `mergeEnrichmentResult(acc, result, sourceName)` — the merge block;
- a `tryPdf(...)` helper — the PDF-extract + emit cycle.

Behaviour must stay identical — `lib/server/enrichment/batch.test.ts` must still pass.

## Fix 5 — SSE response helper

`app/api/analysis/batch/route.ts` and `app/api/enrichment/batch/route.ts` repeat the
`text/event-stream` Response-header block. Add an `sseResponse(stream)` helper next to
`createSSEStream()` in `lib/server/http.ts` and use it in both routes.

## Done criteria

- Migration `20260522000002` applied to prod + local; `press_eligible_publications`
  is `SELECT id, published_at`; `publication_period_counts` + the eligibility smoke
  still work (spot-check: `SELECT count(*) FROM press_eligible_publications`).
- Fixes 2–5 done; `npm run typecheck && npm run lint && npm test` all green.
- Everything (incl. this doc) committed + pushed to `origin/main`; CI green; Vercel deployed.
