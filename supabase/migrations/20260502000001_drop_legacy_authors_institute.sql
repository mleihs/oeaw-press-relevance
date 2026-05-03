-- Drop the dead legacy columns `authors` and `institute` from publications.
--
-- Both columns are 0/217727 populated as of 2026-05-02 — the WebDB ETL has not
-- written to them since the schema moved to relational truth (lead_author +
-- person_publications for people, orgunit_publications for institutes).
-- Keeping them around forced display code into broken fallback chains and let
-- a "Institut: N/A" sneak into every analysis prompt.

ALTER TABLE publications DROP COLUMN IF EXISTS authors;
ALTER TABLE publications DROP COLUMN IF EXISTS institute;
