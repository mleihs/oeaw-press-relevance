-- Canonical Postgres home for the press-pitch eligibility predicate.
--
-- Before this migration the predicate was scattered across THREE places and
-- the excluded publication-type UID list was copy-pasted into SQL twice:
--   1. lib/server/publications/list.ts buildWhere (TS/Drizzle) — list path
--   2. publication_dashboard_stats — hardcoded ARRAY[5,7,8,13,15,19,23]
--   3. publication_period_counts  — hardcoded ARRAY[5,7,8,13,15,19,23]
--      (shipped earlier today in 6fa21da / migration 20260516000001)
--
-- This consolidates the SQL/server side onto two views:
--   * ineligible_publication_types — the ONE place the excluded-type UID
--     list lives on the PG side. lib/shared/eligibility.ts keeps a TS copy
--     because the *client* filter UI runs in the browser and cannot query
--     PG; that copy is now a documented mirror, pinned by scripts/smoke/
--     eligibility.ts (PG view <-> TS constant parity).
--   * press_eligible_publications — THE canonical press-pitch eligibility
--     relation. Anything that counts/lists eligible pubs composes on top
--     of it rather than re-spelling the five clauses.
-- publication_period_counts now aggregates over the view; the server's
-- fetchBadTypeIds() selects ids from ineligible_publication_types; and
-- publication_dashboard_stats sources its type exclusion from the same
-- view (its own, deliberately different NULL-type-inclusive predicate is
-- preserved exactly — proven byte-identical pre-apply).

-- ---------------------------------------------------------------------------
-- 1. Canonical excluded publication types (the one PG home for the UID list)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW ineligible_publication_types AS
  SELECT id, webdb_uid
  FROM publication_types
  -- Mirror of ELIGIBILITY_EXCLUDE_TYPE_UIDS (lib/shared/eligibility.ts):
  -- 5 Rezension · 7 Diplomarbeit · 8 Dissertation · 13 Habilitation ·
  -- 15 Konferenz-Poster · 19 Skriptum · 23 Lexikon-Stub.
  WHERE webdb_uid = ANY (ARRAY[5, 7, 8, 13, 15, 19, 23]);

COMMENT ON VIEW ineligible_publication_types IS
  'Canonical PG resolution of press-ineligible publication_types. UID list mirrors lib/shared/eligibility.ts (the browser filter UI needs a TS copy); parity pinned by scripts/smoke/eligibility.ts.';

-- ---------------------------------------------------------------------------
-- 2. THE canonical press-pitch eligibility relation
-- ---------------------------------------------------------------------------
-- Mirrors lib/server/publications/list.ts buildWhere for the Top-Pubs call.
-- Parity is pinned by the dashboard smoke (periodCounts[period] ===
-- topPubsTotal). Deliberately NOT NULL-type-inclusive (a NULL
-- publication_type_id is excluded via NOT IN) — that matches Drizzle's
-- notInArray and is intentionally distinct from publication_dashboard_stats,
-- which answers a different (corpus-wide) question.
CREATE OR REPLACE VIEW press_eligible_publications AS
  SELECT *
  FROM publications
  WHERE archived = false
    AND analysis_status = 'analyzed'
    AND is_ita_subtree = false
    AND popular_science = false
    AND publication_type_id NOT IN (SELECT id FROM ineligible_publication_types);

COMMENT ON VIEW press_eligible_publications IS
  'THE canonical press-pitch eligibility relation: analyzed, not archived, not ITA-subtree, not pop-science, eligible type. Mirrors lib/server/publications/list.ts buildWhere; parity pinned by the dashboard smoke.';

-- ---------------------------------------------------------------------------
-- 3. period counts — thin aggregation over the canonical view
-- ---------------------------------------------------------------------------
-- Was 4-arg with an inline predicate + hardcoded UID array (20260516000001).
-- The default_eligible arg is now dead (the view IS the eligibility), so the
-- signature changes → DROP + CREATE. Only getPeriodCounts() calls this, and
-- the matching 3-arg caller ships in the same change set.
DROP FUNCTION IF EXISTS publication_period_counts(date, date, date, boolean);

CREATE FUNCTION publication_period_counts(
  p_week  date,
  p_month date,
  p_year  date
)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT jsonb_build_object(
    'week',  count(*) FILTER (WHERE published_at >= p_week),
    'month', count(*) FILTER (WHERE published_at >= p_month),
    'year',  count(*) FILTER (WHERE published_at >= p_year),
    'all',   count(*)
  )
  FROM press_eligible_publications;
$$;

COMMENT ON FUNCTION publication_period_counts IS
  'Per-period counts (week/month/year/all) over press_eligible_publications — one conditional-aggregation roundtrip for the dashboard "Mehr laden" hint. Cutoffs come from TS publishedAfter() (single source of the interval semantics incl. the deliberate two-month "month" window).';

-- ---------------------------------------------------------------------------
-- 4. dashboard_stats — drop the duplicated hardcoded UID array
-- ---------------------------------------------------------------------------
-- Byte-identical refactor (verified pre-apply by an old==new fingerprint on
-- local + prod): the local `exclude_type_ids` CTE is replaced by the
-- canonical view. This function keeps its OWN predicate — archived +
-- default_eligible only, NULL-type-INCLUSIVE via the `IS NULL OR` wrapper.
-- Body is otherwise reproduced verbatim from 20260505000002.
CREATE OR REPLACE FUNCTION publication_dashboard_stats(default_eligible boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  WITH
  filtered AS (
    SELECT
      enrichment_status, enriched_abstract, analysis_status,
      peer_reviewed, popular_science, summary_de, summary_en
    FROM publications p
    WHERE archived = false
      AND (
        NOT default_eligible
        OR publication_type_id IS NULL
        OR publication_type_id NOT IN (SELECT id FROM ineligible_publication_types)
      )
  ),
  counts AS (
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE enrichment_status = 'enriched') AS enriched,
      count(*) FILTER (WHERE enrichment_status = 'partial')  AS partial,
      count(*) FILTER (WHERE enriched_abstract IS NOT NULL)  AS with_abstract,
      count(*) FILTER (WHERE analysis_status = 'analyzed')   AS analyzed,
      count(*) FILTER (WHERE peer_reviewed)                  AS peer_reviewed,
      count(*) FILTER (WHERE popular_science)                AS popular_science,
      count(*) FILTER (WHERE summary_de IS NOT NULL AND summary_en IS NOT NULL) AS bilingual_summary
    FROM filtered
  ),
  -- Score-Stats und Dashboard-Aggregates aus den existierenden Funktionen.
  -- Beide sind STABLE → PG kann sie ggf. gemeinsam mit dem CTE planen.
  -- KEIN default_eligible-Filter hier (entspricht bestehendem Verhalten).
  score AS ( SELECT * FROM publication_score_stats() ),
  agg   AS ( SELECT * FROM publication_dashboard_aggregates() )
  SELECT jsonb_build_object(
    'total',              c.total,
    'enriched',           c.enriched,
    'partial',            c.partial,
    'with_abstract',      c.with_abstract,
    'analyzed',           c.analyzed,
    'peer_reviewed',      c.peer_reviewed,
    'popular_science',    c.popular_science,
    'bilingual_summary',  c.bilingual_summary,
    'avg_score',          s.avg_score,
    'high_score_count',   s.high_score_count,
    'score_distribution', s.score_distribution,
    'dimension_avgs',     a.dimension_avgs,
    'top_keywords',       a.top_keywords
  )
  FROM counts c, score s, agg a;
$$;

COMMENT ON FUNCTION publication_dashboard_stats IS
  'Consolidated dashboard stats. Sources excluded types from the canonical ineligible_publication_types view. Predicate is archived + default_eligible only and NULL-type-INCLUSIVE — deliberately different from press_eligible_publications.';
