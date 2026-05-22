-- Drop 4 unused citation-format columns from publications.
--
-- citation_cbe, citation_harvard, citation_mla and citation_vancouver were
-- copied in from WebDB but are read nowhere in the app: not in the API
-- mapper (lib/server/publications/to-api.ts), not in the Publication wire
-- type, not in any component. They held ~73 MB of TOAST. Dropping them
-- brings the production database back under Supabase's 500 MB free-tier
-- limit. Actively-used citation columns stay: citation, citation_apa,
-- citation_de, citation_en, bibtex, endnote, ris.
--
-- press_eligible_publications is a `SELECT *` view over publications, so it
-- hard-depends on every column. It is dropped and recreated around the
-- column drop, in one transaction (no visibility gap). `SELECT *` re-expands
-- to the remaining columns; the view's consumers (publication_period_counts,
-- the eligibility smoke test) only count rows — they never read citation_*.
--
-- Disk space is reclaimed by `VACUUM FULL publications` after this migration.

BEGIN;

DROP VIEW IF EXISTS press_eligible_publications;

ALTER TABLE publications
  DROP COLUMN IF EXISTS citation_cbe,
  DROP COLUMN IF EXISTS citation_harvard,
  DROP COLUMN IF EXISTS citation_mla,
  DROP COLUMN IF EXISTS citation_vancouver;

-- Recreated verbatim from 20260516000002_press_eligibility_canonical.sql.
CREATE OR REPLACE VIEW press_eligible_publications AS
  SELECT *
  FROM publications
  WHERE archived = false
    AND analysis_status = 'analyzed'
    AND is_ita_subtree = false
    AND popular_science = false
    AND publication_type_id NOT IN (SELECT id FROM ineligible_publication_types);

COMMENT ON VIEW press_eligible_publications IS
  'THE canonical press-pitch eligibility relation: analyzed, not archived, not ITA-subtree, not pop-science, eligible type. Mirrors lib/server/publications/list.ts buildWhere; parity pinned by the dashboard smoke.';

COMMIT;
