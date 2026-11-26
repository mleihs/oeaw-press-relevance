-- Dashboard-Score-Kennzahlen auf die kanonische Grundgesamtheit.
--
-- Die Kachel „N analysiert“ zählt seit 2026-07-09 press_eligible_publications.
-- Histogramm, „Ø %“ und „hohes Story-Potenzial“ (publication_score_stats) zählten
-- dagegen jede analysierte Zeile mit Score: auch archivierte (darunter
-- archivierte Zwillinge, also doppelt), ITA, Pop-Science und untaugliche Typen.
-- Die Dimensionsmittel und Top-Keywords (publication_dashboard_aggregates)
-- schlossen nur Archiviertes aus. Am 2026-11-26 standen so 8.590 Scores
-- (Ø 0.2537, 171 ab 0.6) neben 7.684 analysierten Publikationen
-- (kanonisch Ø 0.2435, 106 ab 0.6).
--
-- Beide Funktionen lesen jetzt über press_eligible_publications, wie jede
-- „bewertet/eligible“-Zählung. Signaturen bleiben gleich, damit
-- publication_dashboard_stats(boolean) unverändert weiterläuft. Kein App-Deploy
-- nötig; das Dashboard cacht 60 s.

CREATE OR REPLACE FUNCTION publication_score_stats()
RETURNS TABLE (
  avg_score          numeric,
  high_score_count   bigint,
  score_distribution int[]
)
LANGUAGE sql STABLE
AS $$
  WITH scores AS (
    SELECT p.press_score
    FROM publications p
    JOIN press_eligible_publications e ON e.id = p.id
    WHERE p.press_score IS NOT NULL
  ),
  buckets AS (
    SELECT
      LEAST(9, FLOOR(press_score * 10)::int) AS bucket,
      COUNT(*)::int AS n
    FROM scores
    GROUP BY bucket
  ),
  hist AS (
    SELECT
      ARRAY(
        SELECT COALESCE((SELECT n FROM buckets WHERE bucket = b), 0)
        FROM generate_series(0, 9) AS b
      ) AS buckets
  )
  SELECT
    (SELECT AVG(press_score) FROM scores) AS avg_score,
    (SELECT COUNT(*) FROM scores WHERE press_score >= 0.6) AS high_score_count,
    (SELECT buckets FROM hist) AS score_distribution;
$$;

COMMENT ON FUNCTION publication_score_stats IS
  'Score-Mittel, Anzahl >= 0.6 und 10er-Histogramm über press_eligible_publications (dieselbe Grundgesamtheit wie die Kachel „N analysiert“).';

CREATE OR REPLACE FUNCTION publication_dashboard_aggregates()
RETURNS TABLE (
  dimension_avgs jsonb,
  top_keywords   jsonb
)
LANGUAGE sql STABLE
AS $$
  WITH analyzed AS (
    SELECT
      p.public_accessibility,
      p.societal_relevance,
      p.novelty_factor,
      p.storytelling_potential,
      p.media_timeliness,
      p.enriched_keywords
    FROM publications p
    JOIN press_eligible_publications e ON e.id = p.id
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
  'Dashboard-Aggregate (5 Dimensionsmittel + Top-30-Keywords) über press_eligible_publications (dieselbe Grundgesamtheit wie die Kachel „N analysiert“).';
