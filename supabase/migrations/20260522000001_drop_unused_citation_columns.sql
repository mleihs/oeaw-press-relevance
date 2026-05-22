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
-- Disk space is reclaimed by a VACUUM FULL on publications after this runs.

ALTER TABLE publications
  DROP COLUMN IF EXISTS citation_cbe,
  DROP COLUMN IF EXISTS citation_harvard,
  DROP COLUMN IF EXISTS citation_mla,
  DROP COLUMN IF EXISTS citation_vancouver;
