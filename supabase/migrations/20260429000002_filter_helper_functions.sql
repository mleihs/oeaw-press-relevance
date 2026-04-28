-- P3: replace the JS 2-step round-trips ("fetch all matching pub-ids, then
-- .in('id', […])") with single-call PG functions that return the matching
-- publication_id set in one query. Up to 50k IDs over the wire becomes one.

CREATE OR REPLACE FUNCTION pub_ids_by_oestat6(p_oestat6_ids uuid[])
RETURNS TABLE (publication_id uuid)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT op.publication_id
  FROM publication_oestat6 op
  WHERE op.oestat6_id = ANY(p_oestat6_ids);
$$;

CREATE OR REPLACE FUNCTION pub_ids_by_highlight(
  p_mahighlight boolean DEFAULT false,
  p_highlight   boolean DEFAULT false
)
RETURNS TABLE (publication_id uuid)
LANGUAGE sql STABLE
AS $$
  SELECT DISTINCT pp.publication_id
  FROM person_publications pp
  WHERE
    (p_mahighlight AND pp.mahighlight)
    OR (p_highlight AND pp.highlight);
$$;
