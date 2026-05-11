-- Defensive fix for press_cluster_view's matched-side JOIN.
--
-- Schema allows multiple press_releases per publication (e.g. DE+EN variants
-- of the same press release). Without DISTINCT ON, JOIN press_releases would
-- silently duplicate the publication's embedding in the cluster — inflating
-- its influence in centroid + k-NN scoring AND surfacing it twice in
-- similar_pressed_pubs results.
--
-- Currently data is 1:1 (114 distinct pubs ↔ 114 matched press_releases),
-- so this is preventive. DISTINCT ON picks the most recent press_release per
-- pub, falling back to lowest id for deterministic results.

CREATE OR REPLACE VIEW press_cluster_view AS
  -- Matched: DISTINCT ON requires per-leg ORDER BY, which needs a wrapping
  -- subquery inside UNION ALL (raw `ORDER BY ... UNION ALL` would apply to
  -- the whole union).
  SELECT * FROM (
    SELECT DISTINCT ON (pe.publication_id)
      pe.embedding,
      pe.model,
      'publication'::TEXT AS kind,
      pe.publication_id   AS publication_id,
      pe.publication_id   AS exclude_pub_id,
      pr.id               AS press_release_id,
      p.title             AS title,
      pr.released_at      AS released_at,
      pr.url              AS press_url
    FROM publication_embeddings pe
    JOIN press_releases pr ON pr.publication_id = pe.publication_id
    JOIN publications   p  ON p.id = pe.publication_id
    ORDER BY pe.publication_id, pr.released_at DESC NULLS LAST, pr.id
  ) matched_distinct

  UNION ALL

  -- Orphans: one embedding per press_release, no JOIN-multiplication risk.
  SELECT
    pre.embedding,
    pre.model,
    'orphan'::TEXT AS kind,
    NULL::UUID     AS publication_id,
    NULL::UUID     AS exclude_pub_id,
    pre.press_release_id,
    COALESCE(NULLIF(pr.paper_title, ''), NULLIF(pr.news_title, ''), '(ohne Titel)') AS title,
    pr.released_at,
    pr.url AS press_url
  FROM press_release_embeddings pre
  JOIN press_releases pr ON pr.id = pre.press_release_id
  WHERE pr.publication_id IS NULL;

COMMENT ON VIEW press_cluster_view IS
  'Unified press-cluster: matched publication_embeddings (DISTINCT ON publication_id picks most recent press_release per pub) + orphan press_release_embeddings (1:1 by construction). Every downstream function reads exclusively from this view; new embedding sources are added as additional UNION-ALL legs without touching the 3 RPC functions.';
