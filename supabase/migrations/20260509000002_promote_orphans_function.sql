-- Promote press_release_orphans → publications when DOI matches a real publication.
--
-- Called automatically at the end of webdb-import.mjs (right after the
-- lead_author + published_at backfills, before the matview refresh). When a
-- new WebDB-import brings in a paper whose DOI was sitting in orphans (e.g.
-- a Co-Author-only paper that finally got an OeAW lead-author entry), the
-- press-release link is moved over and the orphan row is deleted.
--
-- Idempotent + safe:
--   * COALESCE-protected: never overwrites an existing publications.press_release_url
--   * `p.press_release_url IS NULL`-guard: only promotes where no URL set yet
--   * RETURNS row count so the import script can log it.

CREATE OR REPLACE FUNCTION promote_press_release_orphans()
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  n int;
BEGIN
  WITH promoted AS (
    UPDATE publications p SET
      press_release_url   = COALESCE(p.press_release_url, o.press_release_url),
      press_release_at    = COALESCE(p.press_release_at, o.press_release_at),
      press_release_lang  = COALESCE(p.press_release_lang, o.press_release_lang),
      press_release_title = COALESCE(p.press_release_title, o.paper_title, o.news_title)
    FROM press_release_orphans o
    WHERE LOWER(p.doi) = LOWER(o.doi)
      AND p.doi IS NOT NULL
      AND p.press_release_url IS NULL
    RETURNING o.id AS orphan_id
  )
  DELETE FROM press_release_orphans
  WHERE id IN (SELECT orphan_id FROM promoted);

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

COMMENT ON FUNCTION promote_press_release_orphans IS
  'Moves press-release-data from press_release_orphans → publications.press_release_* when DOI now matches a publication. Idempotent. Returns count of promoted rows.';
