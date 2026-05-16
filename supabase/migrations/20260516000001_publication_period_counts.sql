-- Per-period eligible-pub counts for the dashboard "Mehr laden" affordance.
--
-- The Top-Pubs panel's pool predicate (analyzed + default-eligible +
-- not-ITA + not-pop-science + not-archived) currently lives in TypeScript
-- (`lib/server/publications/list.ts` buildWhere, driven by the URL params
-- that `getTopPubs` sets). It is NOT a canonical Postgres object:
-- `publication_dashboard_stats` carries only a *partial* predicate
-- (archived + default_eligible) and counts analyzed/pop_science as
-- conditional columns rather than filtering its base by them.
--
-- This function gives that exact counting-predicate a single canonical
-- Postgres home, so the four period counters come back in ONE conditional-
-- aggregation roundtrip instead of N JS calls to listPublications. The
-- date cutoffs are passed in from the existing TS `publishedAfter()`
-- (single source of truth for the interval semantics, including the
-- deliberate two-month "month" window) — they are query parameters, not
-- business logic, so they intentionally stay in TS.
--
-- Predicate-parity note: `default_eligible` uses `publication_type_id
-- NOT IN (excluded)`, which by SQL three-valued logic also drops rows
-- with a NULL publication_type_id. That matches Drizzle's `notInArray`
-- in listPublications. It deliberately DIVERGES from
-- publication_dashboard_stats (which keeps NULL-type rows via an explicit
-- `publication_type_id IS NULL OR ...`): that function answers a different
-- question (corpus-wide stats); this one must mirror the Top-Pubs list
-- exactly so the "+N in another period" hint is honest.

CREATE OR REPLACE FUNCTION publication_period_counts(
  p_week  date,
  p_month date,
  p_year  date,
  default_eligible boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  WITH exclude_type_ids AS (
    SELECT id FROM publication_types
    WHERE webdb_uid = ANY(ARRAY[5, 7, 8, 13, 15, 19, 23])  -- ELIGIBILITY_EXCLUDE_TYPE_UIDS
  ),
  pool AS (
    SELECT published_at
    FROM publications
    WHERE archived = false
      AND analysis_status = 'analyzed'
      AND is_ita_subtree = false
      AND popular_science = false
      AND (
        NOT default_eligible
        OR publication_type_id NOT IN (SELECT id FROM exclude_type_ids)
      )
  )
  SELECT jsonb_build_object(
    'week',  count(*) FILTER (WHERE published_at >= p_week),
    'month', count(*) FILTER (WHERE published_at >= p_month),
    'year',  count(*) FILTER (WHERE published_at >= p_year),
    'all',   count(*)
  )
  FROM pool;
$$;

COMMENT ON FUNCTION publication_period_counts IS
  'Per-period counts (week/month/year/all) over the dashboard Top-Pubs eligibility pool — one conditional-aggregation roundtrip for the "Mehr laden" cross-period hint. Predicate mirrors lib/server/publications/list.ts (incl. NULL-type exclusion); cutoffs passed in from TS publishedAfter().';
