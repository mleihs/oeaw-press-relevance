-- Add Bayesian-shrunk weighted average to the researcher functions.
--
-- Problem: sorting by raw avg_score promotes single-pub authors with one good
-- score over multi-pub authors with consistent quality. The fix is the IMDb /
-- empirical-Bayes weighted average:
--
--   weighted_avg = (n * person_avg + k * prior) / (n + k)
--
-- where k = 3 (phantom-pub count — researchers need ~3 pubs before their own
-- avg outweighs the prior) and prior = global mean across all eligible pubs in
-- the current filter scope (self-calibrating).
--
-- Both raw and weighted are returned. Either can be picked as p_metric.

DROP FUNCTION IF EXISTS top_researchers(date, text, text, text[], boolean, boolean, boolean, numeric, int, boolean, boolean);
DROP FUNCTION IF EXISTS researcher_distribution(date, text, text, text[], boolean, boolean, boolean, numeric, int, boolean, boolean);

CREATE OR REPLACE FUNCTION top_researchers(
  p_since               date,
  p_metric              text     DEFAULT 'count_high',
  p_authorship_scope    text     DEFAULT 'all',
  p_oestat3_ids         text[]   DEFAULT NULL,
  p_include_external    boolean  DEFAULT false,
  p_include_deceased    boolean  DEFAULT false,
  p_member_only         boolean  DEFAULT false,
  p_min_value           numeric  DEFAULT 1,
  p_limit               int      DEFAULT 50,
  p_exclude_ita         boolean  DEFAULT true,
  p_exclude_outreach    boolean  DEFAULT true
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
  weighted_avg          numeric,
  pubs_total            int,
  self_highlight_count  int,
  top_pub               jsonb,
  sparkline             jsonb
)
LANGUAGE sql STABLE
AS $$
  WITH RECURSIVE ita_tree AS (
    SELECT id FROM orgunits WHERE akronym_de = 'ITA'
    UNION ALL
    SELECT o.id FROM orgunits o JOIN ita_tree it ON o.parent_id = it.id
  ),
  ita_pubs AS (
    SELECT DISTINCT op.publication_id
    FROM orgunit_publications op
    WHERE op.orgunit_id IN (SELECT id FROM ita_tree)
  ),
  outreach_type_ids AS (
    SELECT id FROM publication_types WHERE name_de IN ('aufwändige Multimedia-Publikation')
  ),
  window_pubs AS MATERIALIZED (
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
      AND (NOT p_exclude_ita OR NOT EXISTS (SELECT 1 FROM ita_pubs ip WHERE ip.publication_id = p.id))
      AND (NOT p_exclude_outreach OR p.publication_type_id NOT IN (SELECT id FROM outreach_type_ids))
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
      AND (NOT p_exclude_ita OR NOT EXISTS (SELECT 1 FROM ita_pubs ip WHERE ip.publication_id = p.id))
      AND (NOT p_exclude_outreach OR p.publication_type_id NOT IN (SELECT id FROM outreach_type_ids))
    GROUP BY pp.person_id
  ),
  -- Filter-scope prior for Bayesian shrinkage (self-calibrating).
  global_stats AS (
    SELECT COALESCE(AVG(press_score), 0.4) AS prior_mean
    FROM window_pubs
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
      -- Bayesian shrinkage with k=3
      ((a.pubs_total::numeric * a.avg_score) + (3 * gs.prior_mean))
        / (a.pubs_total + 3) AS weighted_avg,
      a.count_high - COALESCE(pw.prev_count_high, 0) AS delta_count_high,
      pw.prev_count_high IS NULL                     AS is_newcomer,
      CASE p_metric
        WHEN 'count_high'   THEN a.count_high::numeric
        WHEN 'sum_score'    THEN a.sum_score
        WHEN 'avg_score'    THEN a.avg_score
        WHEN 'weighted_avg' THEN ((a.pubs_total::numeric * a.avg_score) + (3 * gs.prior_mean)) / (a.pubs_total + 3)
        WHEN 'pubs_total'   THEN a.pubs_total::numeric
        ELSE a.count_high::numeric
      END AS metric_value
    FROM agg a
    CROSS JOIN global_stats gs
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
    t.rank_now, t.delta_count_high, t.is_newcomer,
    t.person_id, t.firstname, t.lastname, t.orcid, t.slug,
    t.oestat3_name_de, t.external, t.deceased, t.member_type_de,
    t.count_high, t.sum_score, t.avg_score, t.weighted_avg, t.pubs_total,
    t.self_highlight_count,
    tp.top_pub, sp.sparkline
  FROM top_n t
  LEFT JOIN LATERAL (
    SELECT jsonb_build_object(
      'id', wp.pub_id, 'title', wp.title, 'haiku', wp.haiku, 'press_score', wp.press_score
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


CREATE OR REPLACE FUNCTION researcher_distribution(
  p_since               date,
  p_metric              text     DEFAULT 'count_high',
  p_authorship_scope    text     DEFAULT 'all',
  p_oestat3_ids         text[]   DEFAULT NULL,
  p_include_external    boolean  DEFAULT false,
  p_include_deceased    boolean  DEFAULT false,
  p_member_only         boolean  DEFAULT false,
  p_min_value           numeric  DEFAULT 1,
  p_limit               int      DEFAULT 500,
  p_exclude_ita         boolean  DEFAULT true,
  p_exclude_outreach    boolean  DEFAULT true
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
  WITH RECURSIVE ita_tree AS (
    SELECT id FROM orgunits WHERE akronym_de = 'ITA'
    UNION ALL
    SELECT o.id FROM orgunits o JOIN ita_tree it ON o.parent_id = it.id
  ),
  ita_pubs AS (
    SELECT DISTINCT op.publication_id
    FROM orgunit_publications op
    WHERE op.orgunit_id IN (SELECT id FROM ita_tree)
  ),
  outreach_type_ids AS (
    SELECT id FROM publication_types WHERE name_de IN ('aufwändige Multimedia-Publikation')
  ),
  window_pubs AS (
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
      AND (NOT p_exclude_ita OR NOT EXISTS (SELECT 1 FROM ita_pubs ip WHERE ip.publication_id = p.id))
      AND (NOT p_exclude_outreach OR p.publication_type_id NOT IN (SELECT id FROM outreach_type_ids))
  ),
  global_stats AS (
    SELECT COALESCE(AVG(press_score), 0.4) AS prior_mean
    FROM window_pubs
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
      pr.lastname, pr.firstname, pr.oestat3_name_de,
      a.pubs_total, a.count_high,
      pr.member_type_id IS NOT NULL AS is_member,
      CASE p_metric
        WHEN 'count_high'   THEN a.count_high::numeric
        WHEN 'sum_score'    THEN a.sum_score
        WHEN 'avg_score'    THEN a.avg_score
        WHEN 'weighted_avg' THEN ((a.pubs_total::numeric * a.avg_score) + (3 * gs.prior_mean)) / (a.pubs_total + 3)
        WHEN 'pubs_total'   THEN a.pubs_total::numeric
        ELSE a.count_high::numeric
      END AS metric_value
    FROM agg a
    CROSS JOIN global_stats gs
    JOIN persons pr ON pr.id = a.person_id
    WHERE
      (p_include_external OR pr.external = false)
      AND (p_include_deceased OR pr.deceased = false)
      AND (NOT p_member_only OR pr.member_type_id IS NOT NULL)
      AND (p_oestat3_ids IS NULL OR pr.oestat3_name_de = ANY(p_oestat3_ids))
  )
  SELECT person_id, lastname, firstname, oestat3_name_de, metric_value, pubs_total, count_high, is_member
  FROM joined
  WHERE metric_value >= p_min_value
  ORDER BY metric_value DESC NULLS LAST
  LIMIT p_limit;
$$;
