# Migration Rollback Cookbook

We don't ship `*_down.sql` files. Reason: most rollbacks are **destructive
recovery actions**, not symmetrical no-ops, and the right answer depends on
*why* you're rolling back — a forgotten DROP COLUMN destroys data the
migration didn't create. Putting that decision behind a single `down.sql`
hides the trade-off.

This cookbook is the per-migration playbook so the recovery path is explicit.

---

## Before you roll back anything

1. **Snapshot the database first.** `pg_dump` or Supabase Studio → Database
   → Backups. A rollback is much cheaper than re-deriving lost rows.
2. **Quiesce writers.** Pause `scripts/webdb-import.mjs`, the analysis batch,
   and any cron tasks that might race with the rollback. The session
   pipeline is interactive — coordinate with whoever's running it.
3. **Decide the scope.** Are you rolling back ONE migration (latest) or a
   range (e.g. all of `20260428…000003`–`000009`)? Range rollbacks need
   reverse order — newest first.
4. **Ask: is the data loss acceptable?** Adding a column with `ALTER TABLE
   … ADD COLUMN haiku TEXT` is reversible, but `DROP COLUMN haiku` deletes
   every haiku stored since. If they're irrecoverable, restore from snapshot
   instead.

---

## General playbook by migration kind

| Migration kind | Rollback approach | Data risk |
|---|---|---|
| `CREATE INDEX` | `DROP INDEX` | None |
| `CREATE [OR REPLACE] FUNCTION` | `DROP FUNCTION <name>(arg_types)` OR re-apply previous version of the function from git history | None for drop; risk of missing dependency if other functions/RPCs call it |
| `CREATE MATERIALIZED VIEW` | `DROP MATERIALIZED VIEW` | None (MV is derived data) |
| `ALTER TABLE … ADD COLUMN` | `ALTER TABLE … DROP COLUMN` | **Destroys all data in the column** |
| `CREATE TABLE` (data-bearing) | `DROP TABLE` | **Destroys all rows in the table** |
| `INSERT INTO seed_table` | `DELETE FROM seed_table WHERE …` | Recoverable if you have the seed file |
| `ALTER TABLE … ADD CONSTRAINT` | `ALTER TABLE … DROP CONSTRAINT` | None (but rows that violated the constraint are still in the DB and may bite later) |
| `ALTER TABLE … ENABLE RLS` + `CREATE POLICY` | `DROP POLICY` + `ALTER TABLE … DISABLE ROW LEVEL SECURITY` | Opens the table to anon access — tighten elsewhere first |

---

## Per-migration playbook (chronological)

### `20260427000001_initial.sql` — Initial publications table

**DO NOT roll back.** This is the foundation. If the initial schema is wrong,
you're rebuilding the database, not rolling back a migration. Restore from
snapshot or recreate from scratch.

### `20260427000002_constraints_and_indexes.sql`

Adds CHECK constraints and B-tree/GIN indices on `publications`.

```sql
-- Roll back individual indices:
DROP INDEX IF EXISTS idx_pub_doi;
DROP INDEX IF EXISTS idx_pub_analysis;
DROP INDEX IF EXISTS idx_pub_enrichment;
DROP INDEX IF EXISTS idx_pub_score;
DROP INDEX IF EXISTS idx_pub_date;
DROP INDEX IF EXISTS idx_pub_title;
-- Roll back constraints (only if absolutely necessary — they catch real bugs):
ALTER TABLE publications DROP CONSTRAINT IF EXISTS <constraint_name>;
```

Read the migration file for the exact constraint names.

### `20260427000003_webdb_relational.sql`

The big one. Adds `persons`, `orgunits`, `projects`, `lectures`,
`oestat6_categories`, all the lookup tables, and all the M:N junction tables.

**Rolling this back destroys all relational data** — every `persons` row,
every `person_publications` link, every `orgunit_publications` highlight.
Each is a re-derivation from a TYPO3 mysqldump that may not be readily
available.

```sql
-- DESTRUCTIVE. Only after a verified snapshot.
DROP TABLE IF EXISTS person_publications CASCADE;
DROP TABLE IF EXISTS orgunit_publications CASCADE;
DROP TABLE IF EXISTS publication_projects CASCADE;
DROP TABLE IF EXISTS publication_oestat6s CASCADE;
DROP TABLE IF EXISTS person_orgunits CASCADE;
DROP TABLE IF EXISTS lecture_persons CASCADE;
DROP TABLE IF EXISTS lecture_orgunits CASCADE;
DROP TABLE IF EXISTS persons CASCADE;
DROP TABLE IF EXISTS orgunits CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS lectures CASCADE;
DROP TABLE IF EXISTS oestat6_categories CASCADE;
DROP TABLE IF EXISTS publication_types CASCADE;
DROP TABLE IF EXISTS orgunit_types CASCADE;
DROP TABLE IF EXISTS member_types CASCADE;
DROP TABLE IF EXISTS lecture_types CASCADE;
DROP TABLE IF EXISTS extunits CASCADE;
```

Re-deriving requires the original WebDB mysqldump and a fresh `npm run
webdb-import` run.

### `20260427000004_publication_oestat6_matview.sql`

Materialized view for fast pub × oestat6 lookups.

```sql
DROP MATERIALIZED VIEW IF EXISTS publication_oestat6_matview;
```

Loses no data (MV is derived from `publication_oestat6s` + `oestat6_categories`).
The `pub_ids_by_oestat6(...)` filter helper RPC depends on this MV — drop the
RPC first or expect filter queries to fail.

### `20260428000001_publications_haiku.sql`

Adds `haiku TEXT` column to `publications`.

```sql
-- DESTRUCTIVE: loses every haiku ever generated.
ALTER TABLE publications DROP COLUMN IF EXISTS haiku;
```

Re-deriving requires re-running the analysis batch on every analyzed pub.
Cost = (#analyzed) × LLM call.

### `20260428000002_researchers_indices.sql`

Partial composite index on `(published_at, press_score)`.

```sql
DROP INDEX IF EXISTS idx_pub_analyzed_window;
-- Plus any other indices in the migration — read the file.
```

No data loss. Researcher queries get slower (full-scan instead of index-scan).

### `20260428000003_top_researchers_function.sql`

Initial `top_researchers(...)` PG function.

```sql
-- Drop with the EXACT signature; PG functions are overloadable on signature.
DROP FUNCTION IF EXISTS top_researchers(date, text, text, text[], boolean,
  boolean, boolean, numeric, integer);
```

Migrations 04–09 modify this function (add params); roll back the latest
version first or use `DROP FUNCTION ... CASCADE` (will also drop dependent
views — currently none).

### `20260428000004_researcher_distribution_function.sql`

```sql
DROP FUNCTION IF EXISTS researcher_distribution(date, text, text, text[],
  boolean, boolean, boolean, numeric, integer);
```

### `20260428000005_researcher_detail_function.sql`

```sql
DROP FUNCTION IF EXISTS researcher_detail(uuid, date, boolean, boolean);
```

### `20260428000006_researchers_exclude_ita.sql`

`CREATE OR REPLACE FUNCTION` adding `p_exclude_ita boolean DEFAULT true` to
the three researchers RPCs.

**Rolling back means re-applying the version from migration 03–05.** Not a
pure DROP — extract the previous body from git history and re-apply:

```bash
git show 20260428000003:supabase/migrations/20260428000003_top_researchers_function.sql | psql ...
```

### `20260428000007_researchers_exclude_outreach.sql`

Same pattern as 06 — adds `p_exclude_outreach boolean DEFAULT true`.

### `20260428000008_researchers_weighted_avg.sql`

Adds `weighted_avg numeric` to the result of `top_researchers` (Bayessche
Glättung). To roll back: re-apply migration 07's version of the function.

**Note**: any client code that destructures `weighted_avg` will break. The
test in `lib/scoring.test.ts` is a backstop — verify the JS port matches.

### `20260428000009_researchers_citation_field.sql`

Adds `citation` field to `top_pub jsonb` and `publications jsonb` outputs.
Roll back: re-apply the previous function version. UI gracefully degrades
if `citation` is missing (`displayTitle` heuristic just returns the primary
title).

### `20260428000010_rls_lockdown.sql`

Enables RLS on all data-bearing tables with permissive `USING (true)` policies.

```sql
-- Roll back per table:
DROP POLICY IF EXISTS "permissive_select" ON publications;
ALTER TABLE publications DISABLE ROW LEVEL SECURITY;
-- repeat for: persons, orgunits, person_publications, orgunit_publications,
-- projects, lectures, publication_oestat6s, person_orgunits, ...
```

**Security implication**: with RLS off and the anon key still in client env,
anyone with the URL can hit Supabase REST directly. Don't roll this back
unless you've also removed `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_
SUPABASE_ANON_KEY` from the deployed env, OR you're working on local dev only.

### `20260429000001_perf_indices.sql`

Performance indices (trigram, INCLUDE-cols on junction tables).

```sql
DROP INDEX IF EXISTS <each index in the migration>;
```

No data loss; queries become slower.

### `20260429000002_filter_helper_functions.sql`

Adds `pub_ids_by_oestat6(...)` and `pub_ids_by_highlight(...)` RPCs.

```sql
DROP FUNCTION IF EXISTS pub_ids_by_oestat6(uuid[]);
DROP FUNCTION IF EXISTS pub_ids_by_highlight(boolean, boolean);
```

Filter dropdowns on `/publications` will break (the page calls these RPCs).

### `20260429000003_publication_score_stats.sql`

Adds `publication_score_stats(p_since)` for the dashboard.

```sql
DROP FUNCTION IF EXISTS publication_score_stats(date);
```

Dashboard score-distribution + dimensions-radar will fail to load. UI shows
the error state.

### `20260429000004_users_stub.sql`

Adds `users` + `user_settings` tables, the `trg_set_updated_at` trigger
function, and two BEFORE-UPDATE triggers. Stub only — no UI is wired.

```sql
DROP TRIGGER IF EXISTS user_settings_set_updated_at ON user_settings;
DROP TRIGGER IF EXISTS users_set_updated_at ON users;
DROP FUNCTION IF EXISTS trg_set_updated_at();   -- only if no other table uses it
DROP TABLE IF EXISTS user_settings;             -- DESTRUCTIVE: loses all per-user prefs
DROP TABLE IF EXISTS users CASCADE;             -- DESTRUCTIVE: loses all user records
```

Data loss only matters once the table actually has rows; while it's a stub
(no UI wiring), the rollback is harmless. Once Supabase Auth is wired and
real users exist, this rollback is destructive — restore from snapshot
instead.

### `20260429000005_meistertask_task_id.sql`

Adds `publications.meistertask_task_id` text column + partial index for
MeisterTask one-way push dedup. Set by `/api/meistertask/push` after a
successful upstream POST.

```sql
DROP INDEX IF EXISTS idx_publications_meistertask_task_id;
ALTER TABLE publications DROP COLUMN IF EXISTS meistertask_task_id;
```

**Data risk:** Dropping the column loses the mapping between local
publications and their MeisterTask task IDs. After rollback, re-pushing
the same pubs will create duplicate tasks in MeisterTask (no upstream
dedup — task ID is the only reference we keep). If you need the mapping
later, dump `(publications.id, meistertask_task_id)` to CSV before the
DROP — there's no way to recover it from MeisterTask alone.

### `20260429000006_meistertask_task_token.sql`

Adds `publications.meistertask_task_token` for MeisterTask deep-link URLs
(`/app/task/<token>` is the only format that opens a single task in the
web UI; the numeric id form 404s with "Zugriff nicht möglich").

```sql
ALTER TABLE publications DROP COLUMN IF EXISTS meistertask_task_token;
```

**Data risk:** Drops the deep-link tokens. The numeric `meistertask_task_id`
remains, so the API integration still works — only the UI deep-link breaks
(falls back to project-board view in the button/table indicators). Tokens
are recoverable per-task via `GET /tasks/{id}` against MeisterTask, but
that's a O(N) reconciliation script's problem.

---

## When you actually need a rollback

**Common reasons + the right move:**

| Symptom | Action |
|---|---|
| Migration left the DB in inconsistent state | Restore from snapshot — don't try to surgically undo. |
| Function signature change broke client code | Roll back JUST the function (per per-migration playbook) — not the whole batch. |
| Performance regression after index addition | Drop the index. Cheap. |
| RLS policy locked everyone out | `ALTER TABLE … DISABLE ROW LEVEL SECURITY` on the affected table to unblock, then patch the policy in a new migration. |
| Wrong column dropped data | Restore from snapshot — `DROP COLUMN` data is not in WAL after vacuum. |
| MV refresh fell behind | Don't drop — `REFRESH MATERIALIZED VIEW publication_oestat6_matview;` |

**Don't roll back if you can patch forward.** A new migration with the fix
is cleaner than `git revert + drop`. Forward-only migrations are easier to
reason about in CI/CD and across multiple environments.

---

## Supabase-specific tooling

```bash
# List applied migrations:
supabase migration list

# Re-apply a single migration (after dropping its effects manually):
supabase db push --include-all=false

# Nuclear: reset local DB to the migration history (DELETES ALL LOCAL DATA):
supabase db reset

# Inspect what migrations Supabase thinks are applied (the "_supabase_migrations" table):
supabase db query "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;"
```

`supabase db reset` is local-only by default — it never targets a remote
project. Don't pass `--linked` unless you understand the consequences.

For production: never use `supabase db reset`. Always go through
`pg_dump` → review → manual SQL.

---

## Backup discipline

- **Local dev**: snapshots optional; `supabase db reset` is the recovery tool.
- **Production (when there is one)**: schedule daily `pg_dump` via Supabase
  point-in-time recovery (PITR is on Pro plan and up); test restore quarterly.
- **Before any destructive migration**: `pg_dump > pre-${migration_name}-$(date +%Y%m%d).sql.gz`.

The cost of a backup is seconds. The cost of forgetting is hours-to-days.
