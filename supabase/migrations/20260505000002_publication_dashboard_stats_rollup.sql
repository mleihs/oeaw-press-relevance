-- Konsolidierte Dashboard-Stats-Funktion: 1 PG-Roundtrip statt 10.
--
-- Die /api/publications?stats=true-Route führte bisher 10 sequentielle
-- Supabase-Calls aus (8× count, 2× rpc), je mit ~150-300ms HTTP-Latency.
-- Resultat: 4-7s Dashboard-Load auf Vercel/Prod, obwohl die Response
-- nur 1.7 KB groß ist.
--
-- Diese Funktion bündelt alles in EINER STABLE-SQL-Funktion. PG kann die
-- CTEs gemeinsam optimieren, Plan-Cache greift, kein HTTP-Overhead pro
-- Sub-Query. Erwartung: <1s Dashboard-Load.
--
-- exclude_type_uids ist hardcoded auf den Wert aus lib/eligibility.ts,
-- weil das eine stabile Domain-Konstante ist. Wenn sich die ändert,
-- diese Funktion mit einer neuen Migration ersetzen.

CREATE OR REPLACE FUNCTION publication_dashboard_stats(default_eligible boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  WITH
  exclude_type_ids AS (
    SELECT id FROM publication_types
    WHERE webdb_uid = ANY(ARRAY[5, 7, 8, 13, 15, 19, 23])  -- ELIGIBILITY_EXCLUDE_TYPE_UIDS
  ),
  filtered AS (
    SELECT
      enrichment_status, enriched_abstract, analysis_status,
      peer_reviewed, popular_science, summary_de, summary_en
    FROM publications p
    WHERE archived = false
      AND (
        NOT default_eligible
        OR publication_type_id IS NULL
        OR publication_type_id NOT IN (SELECT id FROM exclude_type_ids)
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
  'Consolidated dashboard stats — replaces the 10-roundtrip /api/publications?stats=true query path with a single STABLE-fn call. ~3 MB → 2 KB, 4-7s → <1s.';
