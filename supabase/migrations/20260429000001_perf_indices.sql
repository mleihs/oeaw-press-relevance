-- P4 + P5: Performance indices for hot-path search and the researcher
-- function's junction lookup.

-- P4: lead_author search currently sequential-scans publications because only
-- title has a trigram index. Add the same gin/trigram index pattern.
CREATE INDEX IF NOT EXISTS idx_pub_lead_author_trgm
  ON publications USING gin (lead_author gin_trgm_ops)
  WHERE lead_author IS NOT NULL AND lead_author <> '';

-- P4-bonus: same for original_title and summary_de (both also in the OR-search).
CREATE INDEX IF NOT EXISTS idx_pub_original_title_trgm
  ON publications USING gin (original_title gin_trgm_ops)
  WHERE original_title IS NOT NULL AND original_title <> '';

-- P5: top_researchers' join through person_publications hits the PK index
-- (person_id, publication_id) which doesn't help when the join key is
-- publication_id. The existing idx_person_pubs_pub indexes publication_id
-- alone but lacks INCLUDE cols, forcing a heap lookup for authorship +
-- mahighlight on every row of the window. Index-only-scan with INCLUDE.
DROP INDEX IF EXISTS idx_person_pubs_pub;
CREATE INDEX idx_person_pubs_pub
  ON person_publications (publication_id)
  INCLUDE (person_id, authorship, mahighlight);
