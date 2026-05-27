-- Press-triage truth for "which OEAW units are connected to this paper?"
--
-- WebDB's own orgunit_publications captures EXPLICIT attribution (an
-- institute claimed the paper). For ~4% of analyzed pubs the table is
-- empty even when an OEAW author co-authored: the lead is external and
-- WebDB didn't claim the paper for any unit, but the press team still
-- has a relevant OEAW contact via the co-author's affiliation.
--
-- This view is the single place where that derivation lives:
--   * direct attribution wins (orgunit_publications stays the editorial
--     truth — the ETL pipeline keeps writing it as-is)
--   * transitive author-affiliation is ADDED only when direct is empty
--     (so a paper attributed to ÖAI keeps just that chip; one with
--     zero attribution gains chips for every author's home unit)
--
-- Read path: publications/list.ts + publications/fetch.ts read from
-- this view via a thin repo helper. Write path (ingest/loader, ETL)
-- continues to target the orgunit_publications base table — the view
-- is read-only by definition, and the editorial truth stays separable.
--
-- The `source` column is preserved so the UI can later distinguish
-- (e.g. dim the derived ones, mark them in the InfoBubble) without a
-- second query.

CREATE VIEW publication_orgunit_context AS
  SELECT publication_id, orgunit_id, 'attributed'::TEXT AS source
  FROM orgunit_publications

  UNION ALL

  SELECT DISTINCT pp.publication_id, op.orgunit_id, 'author_affiliation'::TEXT AS source
  FROM person_publications pp
  JOIN orgunit_persons op ON op.person_id = pp.person_id
  -- Only fill when the publication has NO direct attribution at all.
  -- A paper that WebDB editorially claimed for ÖAI is not re-decorated
  -- with every co-author's home unit; that would be noise.
  WHERE NOT EXISTS (
    SELECT 1 FROM orgunit_publications opub
    WHERE opub.publication_id = pp.publication_id
  );

COMMENT ON VIEW publication_orgunit_context IS
  'Press-triage orgunit context: orgunit_publications (editorial truth, "attributed") UNION ALL author-affiliation derivation ("author_affiliation"), where the derived rows fire only for publications that have zero direct attribution. Read-only — write to orgunit_publications.';
