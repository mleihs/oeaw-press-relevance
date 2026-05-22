-- Narrow press_eligible_publications from SELECT * to an explicit column list.
--
-- The view existed as `SELECT * FROM publications WHERE <5 eligibility
-- clauses>`. SELECT * coupled it to every publications column, so dropping
-- any column needed a DROP/recreate of the view inside the same migration
-- (see 20260522000001, the citation-column drop). Pinning the SELECT to the
-- columns the consumers actually read decouples the view from all the others.
--
-- Consumers and the columns they read:
--   * publication_period_counts(date,date,date) — counts rows, filters on
--     published_at.
--   * scripts/smoke/eligibility.ts — counts rows; pin #2 reads the five
--     predicate columns (archived, analysis_status, is_ita_subtree,
--     popular_science, publication_type_id) to assert the view enforces
--     every eligibility clause. Those five must stay in the SELECT.
--
-- CREATE OR REPLACE VIEW cannot drop columns, so this is a DROP + CREATE.
-- DB-only change — no application code depends on the view's column set.
BEGIN;

DROP VIEW press_eligible_publications;

CREATE VIEW press_eligible_publications AS
  SELECT id, published_at, archived, analysis_status,
         is_ita_subtree, popular_science, publication_type_id
  FROM publications
  WHERE archived = false
    AND analysis_status = 'analyzed'
    AND is_ita_subtree = false
    AND popular_science = false
    AND publication_type_id NOT IN (SELECT id FROM ineligible_publication_types);

COMMENT ON VIEW press_eligible_publications IS
  'THE canonical press-pitch eligibility relation: analyzed, not archived, not ITA-subtree, not pop-science, eligible type. Mirrors lib/server/publications/list.ts buildWhere; parity pinned by the dashboard smoke.';

COMMIT;
