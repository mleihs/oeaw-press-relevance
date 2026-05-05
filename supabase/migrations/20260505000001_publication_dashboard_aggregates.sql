-- Dashboard-Aggregate in einer PG-Roundtrip statt 500-Pub-Pull mit
-- clientseitiger Reduce-Loop. Spiegelt die Schichtung von
-- publication_score_stats() (P1).
--
-- Vor diesem Patch zog das Dashboard via /api/publications?pageSize=500
-- &analysis_status=analyzed bis zu 500 vollständige Pub-Rows in den
-- Browser, nur um clientseitig 5 Dimension-Mittelwerte und Top-30-Keywords
-- zu berechnen — ~1-3 MB Network + dicker SELECT * mit Joins.
--
-- Diese Funktion liefert beides als 2 KB JSON in <100 ms.
-- Scope: alle analyzed + nicht-archivierten Pubs (analog zur Dashboard-
-- Headline „Dimensions-Profil aller analysierten Publikationen").

CREATE OR REPLACE FUNCTION publication_dashboard_aggregates()
RETURNS TABLE (
  dimension_avgs jsonb,
  top_keywords   jsonb
)
LANGUAGE sql STABLE
AS $$
  WITH analyzed AS (
    SELECT
      public_accessibility,
      societal_relevance,
      novelty_factor,
      storytelling_potential,
      media_timeliness,
      enriched_keywords
    FROM publications
    WHERE analysis_status = 'analyzed'
      AND archived = false
  ),
  dim_avgs AS (
    SELECT jsonb_build_object(
      'public_accessibility',   COALESCE(AVG(public_accessibility),   0),
      'societal_relevance',     COALESCE(AVG(societal_relevance),     0),
      'novelty_factor',         COALESCE(AVG(novelty_factor),         0),
      'storytelling_potential', COALESCE(AVG(storytelling_potential), 0),
      'media_timeliness',       COALESCE(AVG(media_timeliness),       0)
    ) AS avgs
    FROM analyzed
  ),
  -- Keyword-Frequenz: unnest + LOWER(TRIM(...)) für Case-Insensitive-Merge,
  -- analog zur clientseitigen Logik in app/page.tsx (`normalized = kw.trim().toLowerCase()`).
  -- Filtert leere Strings raus, GROUP BY normalized form, top 30.
  kws AS (
    SELECT
      LOWER(TRIM(kw)) AS word,
      COUNT(*)::int   AS count
    FROM analyzed,
         unnest(COALESCE(enriched_keywords, '{}'::text[])) AS kw
    WHERE kw IS NOT NULL AND TRIM(kw) <> ''
    GROUP BY 1
    ORDER BY 2 DESC, 1 ASC
    LIMIT 30
  ),
  kws_json AS (
    SELECT
      COALESCE(
        jsonb_agg(jsonb_build_object('word', word, 'count', count) ORDER BY count DESC, word ASC),
        '[]'::jsonb
      ) AS keywords
    FROM kws
  )
  SELECT
    d.avgs     AS dimension_avgs,
    k.keywords AS top_keywords
  FROM dim_avgs d, kws_json k;
$$;

COMMENT ON FUNCTION publication_dashboard_aggregates IS
  'Dashboard-Aggregates (5 dim averages + top-30 keywords) over all analyzed, non-archived pubs. Returns ~2 KB JSON in <100ms — replaces the 500-pub client-side fetch.';
