-- Researcher detail page. Single round-trip returns the entire detail view:
-- person stammdaten, aggregated stats with previous-period deltas, monthly
-- activity grouped by score bands, top co-authors, and the full publication
-- list — all as JSONB columns ready for the client to render.
--
-- window_pubs is referenced four times, so MATERIALIZED to compute once.

CREATE OR REPLACE FUNCTION researcher_detail(
  p_person_id  uuid,
  p_since      date
)
RETURNS TABLE (
  person        jsonb,
  stats         jsonb,
  activity      jsonb,
  coauthors     jsonb,
  publications  jsonb
)
LANGUAGE sql STABLE
AS $$
  WITH window_pubs AS MATERIALIZED (
    SELECT pp.publication_id AS pub_id, p.title, p.haiku, p.press_score, p.published_at,
           pp.authorship, pp.mahighlight, pp.highlight,
           CASE
             WHEN p.press_score >= 0.7 THEN 'high'
             WHEN p.press_score >= 0.4 THEN 'mid'
             ELSE 'low'
           END AS band
    FROM publications p
    JOIN person_publications pp ON pp.publication_id = p.id
    WHERE p.analysis_status = 'analyzed'
      AND p.press_score IS NOT NULL
      AND p.published_at >= p_since
      AND pp.person_id = p_person_id
  ),
  prev_pubs AS MATERIALIZED (
    SELECT p.press_score
    FROM publications p
    JOIN person_publications pp ON pp.publication_id = p.id
    WHERE p.analysis_status = 'analyzed'
      AND p.press_score IS NOT NULL
      AND p.published_at >= p_since - (CURRENT_DATE - p_since)
      AND p.published_at <  p_since
      AND pp.person_id = p_person_id
  )
  SELECT
    -- Person stammdaten
    (
      SELECT jsonb_build_object(
        'id',               pr.id,
        'firstname',        pr.firstname,
        'lastname',         pr.lastname,
        'orcid',            pr.orcid,
        'slug',             pr.slug,
        'oestat3_name_de',  pr.oestat3_name_de,
        'oestat3_name_en',  pr.oestat3_name_en,
        'research_fields',  pr.research_fields,
        'portrait',         pr.portrait,
        'biography_de',     pr.biography_de,
        'external',         pr.external,
        'deceased',         pr.deceased,
        'member_type_de',   mt.name_de,
        'webdb_uid',        pr.webdb_uid
      )
      FROM persons pr
      LEFT JOIN member_types mt ON mt.id = pr.member_type_id
      WHERE pr.id = p_person_id
    ) AS person,
    -- Stats: current window + previous window for delta
    (
      SELECT jsonb_build_object(
        'count_high',           COUNT(*) FILTER (WHERE press_score >= 0.7),
        'sum_score',            COALESCE(SUM(press_score), 0),
        'avg_score',            AVG(press_score),
        'pubs_total',           COUNT(*),
        'self_highlight_count', COUNT(*) FILTER (WHERE mahighlight),
        'prev_count_high',      (SELECT COUNT(*) FILTER (WHERE press_score >= 0.7) FROM prev_pubs),
        'prev_pubs_total',      (SELECT COUNT(*) FROM prev_pubs),
        'top_pub',              (
          SELECT jsonb_build_object('id', pub_id, 'title', title, 'haiku', haiku, 'press_score', press_score)
          FROM window_pubs ORDER BY press_score DESC NULLS LAST LIMIT 1
        )
      )
      FROM window_pubs
    ) AS stats,
    -- Activity: monthly bucket × score-band counts
    (
      WITH series AS (
        SELECT generate_series(
          date_trunc('month', p_since)::timestamp,
          date_trunc('month', CURRENT_DATE)::timestamp,
          interval '1 month'
        )::date AS m
      ),
      bands AS (
        SELECT date_trunc('month', published_at)::date AS m,
               COUNT(*) FILTER (WHERE band = 'high')::int AS high,
               COUNT(*) FILTER (WHERE band = 'mid')::int  AS mid,
               COUNT(*) FILTER (WHERE band = 'low')::int  AS low
        FROM window_pubs
        GROUP BY 1
      )
      SELECT jsonb_agg(
        jsonb_build_object(
          'm',    to_char(s.m, 'YYYY-MM'),
          'high', COALESCE(b.high, 0),
          'mid',  COALESCE(b.mid, 0),
          'low',  COALESCE(b.low, 0)
        )
        ORDER BY s.m
      )
      FROM series s LEFT JOIN bands b USING (m)
    ) AS activity,
    -- Co-authors: top 10 by shared publications in window
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',              co.id,
          'firstname',       co.firstname,
          'lastname',        co.lastname,
          'slug',            co.slug,
          'oestat3_name_de', co.oestat3_name_de,
          'shared_pubs',     c.shared
        )
        ORDER BY c.shared DESC, co.lastname
      )
      FROM (
        SELECT pp2.person_id AS coauthor_id, COUNT(*)::int AS shared
        FROM person_publications pp1
        JOIN person_publications pp2 ON pp2.publication_id = pp1.publication_id
        JOIN window_pubs wp ON wp.pub_id = pp1.publication_id
        WHERE pp1.person_id = p_person_id AND pp2.person_id <> p_person_id
        GROUP BY pp2.person_id
        ORDER BY shared DESC
        LIMIT 10
      ) c
      JOIN persons co ON co.id = c.coauthor_id
    ) AS coauthors,
    -- Publications list
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',           pub_id,
          'title',        title,
          'haiku',        haiku,
          'press_score',  press_score,
          'published_at', to_char(published_at, 'YYYY-MM-DD'),
          'authorship',   authorship,
          'mahighlight',  mahighlight,
          'highlight',    highlight,
          'band',         band
        )
        ORDER BY press_score DESC NULLS LAST, published_at DESC
      )
      FROM window_pubs
    ) AS publications;
$$;
