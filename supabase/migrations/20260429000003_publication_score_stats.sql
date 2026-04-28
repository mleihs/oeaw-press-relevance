-- P1: replace the JS loop that paginates EVERY analyzed press_score into
-- Node memory just to compute mean + count(>=0.6) + 10-bucket histogram.
-- One PG call returns the lot in <50ms.

CREATE OR REPLACE FUNCTION publication_score_stats()
RETURNS TABLE (
  avg_score          numeric,
  high_score_count   bigint,
  score_distribution int[]
)
LANGUAGE sql STABLE
AS $$
  WITH scores AS (
    SELECT press_score
    FROM publications
    WHERE analysis_status = 'analyzed'
      AND press_score IS NOT NULL
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
