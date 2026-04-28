-- Tighten data integrity and add indexes for actual query patterns.
-- Verified zero duplicates on csv_uid and on non-null doi as of 2026-04-27.

-- Uniqueness for the natural keys.
ALTER TABLE publications
  ADD CONSTRAINT publications_csv_uid_unique UNIQUE (csv_uid);

CREATE UNIQUE INDEX IF NOT EXISTS publications_doi_unique_not_null
  ON publications (doi)
  WHERE doi IS NOT NULL;

-- Keyword search uses array containment / overlap; needs GIN.
CREATE INDEX IF NOT EXISTS idx_pub_keywords_gin
  ON publications USING gin (enriched_keywords);

-- Most analysis-page queries filter on analysis_status and order by press_score DESC.
CREATE INDEX IF NOT EXISTS idx_pub_analysis_score
  ON publications (analysis_status, press_score DESC NULLS LAST);

-- Enrichment queue: filter by enrichment_status, order by created_at.
CREATE INDEX IF NOT EXISTS idx_pub_enrichment_created
  ON publications (enrichment_status, created_at);
