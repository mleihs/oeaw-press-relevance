-- Researcher leaderboard. One pure-SQL function returns the top-N researchers
-- with rank, deltas, top pub, and a 12-bucket sparkline — everything the UI
-- needs to render the leaderboard and spotlight, in a single round-trip.
--
-- Metric is dynamic via CASE on a text parameter (no SQL injection vector
-- because the value is never used as an identifier).

CREATE OR REPLACE FUNCTION top_researchers(
  p_since               date,
  p_metric              text     DEFAULT 'count_high',     -- count_high | sum_score | avg_score | pubs_total
  p_authorship_scope    text     DEFAULT 'all',            -- all | lead. Default 'all' because the WebDB only fills authorship for a small fraction of rows; 'lead' would exclude ~98% of data.
  p_oestat3_ids         text[]   DEFAULT NULL,
  p_include_external    boolean  DEFAULT false,
  p_include_deceased    boolean  DEFAULT false,
  p_member_only         boolean  DEFAULT false,
  p_min_value           numeric  DEFAULT 1,
  p_limit               int      DEFAULT 50
)
RETURNS TABLE (
  rank_now              int,
  delta_count_high      int,
  is_newcomer           boolean,
  person_id             uuid,
  firstname             text,
  lastname              text,
  orcid                 text,
  slug                  text,
  oestat3_name_de       text,
  external              boolean,
  deceased              boolean,
  member_type_de        text,
  count_high            int,
  sum_score             numeric,
  avg_score             numeric,
  pubs_total            int,
  self_highlight_count  int,
  top_pub               jsonb,
  sparkline             jsonb
)
LANGUAGE sql STABLE
AS $$
  WITH window_pubs AS MATERIALIZED (
    SELECT pp.person_id, p.id AS pub_id, p.title, p.haiku,
           p.press_score, p.published_at, pp.authorship, pp.mahighlight
    FROM publications p
    JOIN person_publications pp ON pp.publication_id = p.id
    WHERE p.analysis_status = 'analyzed'
      AND p.press_score IS NOT NULL
      AND p.published_at >= p_since
      AND (
        p_authorship_scope = 'all'
        OR pp.authorship IN ('HauptautorIn', 'AlleinautorIn')
      )
  ),
  prev_window AS (
    SELECT pp.person_id,
           COUNT(*) FILTER (WHERE p.press_score >= 0.7)::int AS prev_count_high
    FROM publications p
    JOIN person_publications pp ON pp.publication_id = p.id
    WHERE p.analysis_status = 'analyzed'
      AND p.press_score IS NOT NULL
      AND p.published_at >= p_since - (CURRENT_DATE - p_since)
      AND p.published_at <  p_since
      AND (
        p_authorship_scope = 'all'
        OR pp.authorship IN ('HauptautorIn', 'AlleinautorIn')
      )
    GROUP BY pp.person_id
  ),
  agg AS (
    SELECT
      person_id,
      COUNT(*) FILTER (WHERE press_score >= 0.7)::int AS count_high,
      SUM(press_score)                                AS sum_score,
      AVG(press_score)                                AS avg_score,
      COUNT(*)::int                                   AS pubs_total,
      COUNT(*) FILTER (WHERE mahighlight)::int        AS self_highlight_count
    FROM window_pubs
    GROUP BY person_id
  ),
  joined AS (
    SELECT
      pr.id AS person_id,
      pr.firstname, pr.lastname, pr.orcid, pr.slug,
      pr.oestat3_name_de, pr.external, pr.deceased,
      mt.name_de AS member_type_de,
      a.count_high, a.sum_score, a.avg_score, a.pubs_total,
      a.self_highlight_count,
      a.count_high - COALESCE(pw.prev_count_high, 0) AS delta_count_high,
      pw.prev_count_high IS NULL                     AS is_newcomer,
      CASE p_metric
        WHEN 'count_high' THEN a.count_high::numeric
        WHEN 'sum_score'  THEN a.sum_score
        WHEN 'avg_score'  THEN a.avg_score
        WHEN 'pubs_total' THEN a.pubs_total::numeric
        ELSE a.count_high::numeric
      END AS metric_value
    FROM agg a
    JOIN persons pr ON pr.id = a.person_id
    LEFT JOIN member_types mt ON mt.id = pr.member_type_id
    LEFT JOIN prev_window pw ON pw.person_id = a.person_id
    WHERE
      (p_include_external OR pr.external = false)
      AND (p_include_deceased OR pr.deceased = false)
      AND (NOT p_member_only OR pr.member_type_id IS NOT NULL)
      AND (p_oestat3_ids IS NULL OR pr.oestat3_name_de = ANY(p_oestat3_ids))
  ),
  filtered AS (
    SELECT * FROM joined WHERE metric_value >= p_min_value
  ),
  ranked AS (
    SELECT
      RANK() OVER (
        ORDER BY metric_value DESC NULLS LAST,
                 sum_score    DESC NULLS LAST,
                 person_id
      )::int AS rank_now,
      *
    FROM filtered
  ),
  top_n AS (
    SELECT * FROM ranked ORDER BY rank_now, lastname LIMIT p_limit
  )
  SELECT
    t.rank_now,
    t.delta_count_high,
    t.is_newcomer,
    t.person_id, t.firstname, t.lastname, t.orcid, t.slug,
    t.oestat3_name_de, t.external, t.deceased, t.member_type_de,
    t.count_high, t.sum_score, t.avg_score, t.pubs_total,
    t.self_highlight_count,
    tp.top_pub,
    sp.sparkline
  FROM top_n t
  LEFT JOIN LATERAL (
    SELECT jsonb_build_object(
      'id',          wp.pub_id,
      'title',       wp.title,
      'haiku',       wp.haiku,
      'press_score', wp.press_score
    ) AS top_pub
    FROM window_pubs wp
    WHERE wp.person_id = t.person_id
    ORDER BY wp.press_score DESC NULLS LAST
    LIMIT 1
  ) tp ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object('m', to_char(s.m, 'YYYY-MM'), 'c', COALESCE(c.c, 0))
      ORDER BY s.m
    ) AS sparkline
    FROM (
      SELECT generate_series(
        date_trunc('month', p_since)::timestamp,
        date_trunc('month', CURRENT_DATE)::timestamp,
        interval '1 month'
      )::date AS m
    ) s
    LEFT JOIN (
      SELECT date_trunc('month', wp.published_at)::date AS m,
             COUNT(*) FILTER (WHERE wp.press_score >= 0.7)::int AS c
      FROM window_pubs wp
      WHERE wp.person_id = t.person_id
      GROUP BY 1
    ) c USING (m)
  ) sp ON true
  ORDER BY t.rank_now, t.lastname;
$$;
