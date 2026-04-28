-- Researcher functions: add p_exclude_ita boolean parameter (default true).
-- Default-excludes publications tagged to the ITA orgunit subtree
-- (Institut für Technikfolgen-Abschätzung), matching the convention already
-- used in scripts/session-pipeline.mjs (ITA scores live in prod-DB and the
-- house style treats them separately from the press-relevance scoring).
--
-- Function signatures change, so DROP first then CREATE OR REPLACE.

DROP FUNCTION IF EXISTS top_researchers(date, text, text, text[], boolean, boolean, boolean, numeric, int);
DROP FUNCTION IF EXISTS researcher_distribution(date, text, text, text[], boolean, boolean, boolean, numeric, int);
DROP FUNCTION IF EXISTS researcher_detail(uuid, date);

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
  p_exclude_ita         boolean  DEFAULT true
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
  p_exclude_ita         boolean  DEFAULT true
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
  SELECT person_id, lastname, firstname, oestat3_name_de, metric_value, pubs_total, count_high, is_member
  FROM joined
  WHERE metric_value >= p_min_value
  ORDER BY metric_value DESC NULLS LAST
  LIMIT p_limit;
$$;


CREATE OR REPLACE FUNCTION researcher_detail(
  p_person_id   uuid,
  p_since       date,
  p_exclude_ita boolean DEFAULT true
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
  window_pubs AS MATERIALIZED (
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
      AND (NOT p_exclude_ita OR NOT EXISTS (SELECT 1 FROM ita_pubs ip WHERE ip.publication_id = p.id))
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
      AND (NOT p_exclude_ita OR NOT EXISTS (SELECT 1 FROM ita_pubs ip WHERE ip.publication_id = p.id))
  )
  SELECT
    (
      SELECT jsonb_build_object(
        'id', pr.id, 'firstname', pr.firstname, 'lastname', pr.lastname,
        'orcid', pr.orcid, 'slug', pr.slug,
        'oestat3_name_de', pr.oestat3_name_de, 'oestat3_name_en', pr.oestat3_name_en,
        'research_fields', pr.research_fields, 'portrait', pr.portrait,
        'biography_de', pr.biography_de,
        'external', pr.external, 'deceased', pr.deceased,
        'member_type_de', mt.name_de,
        'webdb_uid', pr.webdb_uid
      )
      FROM persons pr
      LEFT JOIN member_types mt ON mt.id = pr.member_type_id
      WHERE pr.id = p_person_id
    ) AS person,
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
