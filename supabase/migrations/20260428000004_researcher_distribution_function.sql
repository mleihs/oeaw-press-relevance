-- Researcher distribution / beeswarm. Returns the metric value for every
-- qualifying person (capped at p_limit), without sparklines or top-pub —
-- the beeswarm only needs position, color category, and bubble size.

CREATE OR REPLACE FUNCTION researcher_distribution(
  p_since               date,
  p_metric              text     DEFAULT 'count_high',
  p_authorship_scope    text     DEFAULT 'all',
  p_oestat3_ids         text[]   DEFAULT NULL,
  p_include_external    boolean  DEFAULT false,
  p_include_deceased    boolean  DEFAULT false,
  p_member_only         boolean  DEFAULT false,
  p_min_value           numeric  DEFAULT 1,
  p_limit               int      DEFAULT 500
)
RETURNS TABLE (
  person_id        uuid,
  lastname         text,
  firstname        text,
  oestat3_name_de  text,
  metric_value     numeric,
  pubs_total       int,
  count_high       int,
  is_member        boolean
)
LANGUAGE sql STABLE
AS $$
  WITH window_pubs AS (
    SELECT pp.person_id, p.press_score, p.published_at
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
  agg AS (
    SELECT
      person_id,
      COUNT(*) FILTER (WHERE press_score >= 0.7)::int AS count_high,
      SUM(press_score)                                AS sum_score,
      AVG(press_score)                                AS avg_score,
      COUNT(*)::int                                   AS pubs_total
    FROM window_pubs
    GROUP BY person_id
  ),
  joined AS (
    SELECT
      pr.id           AS person_id,
      pr.lastname,
      pr.firstname,
      pr.oestat3_name_de,
      a.pubs_total,
      a.count_high,
      pr.member_type_id IS NOT NULL AS is_member,
      CASE p_metric
        WHEN 'count_high' THEN a.count_high::numeric
        WHEN 'sum_score'  THEN a.sum_score
        WHEN 'avg_score'  THEN a.avg_score
        WHEN 'pubs_total' THEN a.pubs_total::numeric
        ELSE a.count_high::numeric
      END AS metric_value
    FROM agg a
    JOIN persons pr ON pr.id = a.person_id
    WHERE
      (p_include_external OR pr.external = false)
      AND (p_include_deceased OR pr.deceased = false)
      AND (NOT p_member_only OR pr.member_type_id IS NOT NULL)
      AND (p_oestat3_ids IS NULL OR pr.oestat3_name_de = ANY(p_oestat3_ids))
  )
  SELECT
    person_id, lastname, firstname, oestat3_name_de,
    metric_value, pubs_total, count_high, is_member
  FROM joined
  WHERE metric_value >= p_min_value
  ORDER BY metric_value DESC NULLS LAST
  LIMIT p_limit;
$$;
