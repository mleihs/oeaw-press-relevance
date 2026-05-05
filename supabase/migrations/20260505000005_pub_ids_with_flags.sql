-- Function: get all publication IDs that currently have at least one flag note.
-- Used by /api/publications when ?flagged=true is set, and by the dashboard
-- "Geflaggt für Sitzung"-card.
--
-- Pattern matches pub_ids_by_oestat6 / pub_ids_by_highlight: server-side
-- pre-fetch of an ID set, then .in('id', [...]) on the main query — keeps
-- PostgREST honest because flag_notes is JSONB and not natively filterable
-- via jsonb_array_length().
--
-- archived=false: archived rows shouldn't show up in any flagged-view UI;
-- if a flag was set on a row that later got archived, it stays in the JSONB
-- but doesn't surface here.

CREATE OR REPLACE FUNCTION pub_ids_with_flags()
RETURNS TABLE(publication_id uuid)
LANGUAGE sql
STABLE
AS $$
  SELECT id
  FROM publications
  WHERE archived = false
    AND jsonb_array_length(flag_notes) > 0
$$;

COMMENT ON FUNCTION pub_ids_with_flags IS
  'Returns publication IDs with at least one flag note. Used by /api/publications?flagged=true and the dashboard flagged-count card.';
