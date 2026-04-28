-- Initial schema for the OeAW Press Relevance Analyzer.
-- Idempotent: safe to apply against an existing database.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Core fields (from CSV)
  title TEXT NOT NULL,
  authors TEXT,
  abstract TEXT,
  doi TEXT,
  published_at DATE,
  publication_type TEXT,
  institute TEXT,
  open_access BOOLEAN DEFAULT FALSE,
  oa_type TEXT,
  url TEXT,
  citation TEXT,
  csv_uid TEXT,
  -- Enrichment fields
  enrichment_status TEXT DEFAULT 'pending',
  enriched_abstract TEXT,
  enriched_keywords TEXT[],
  enriched_journal TEXT,
  enriched_source TEXT,
  full_text_snippet TEXT,
  word_count INTEGER DEFAULT 0,
  -- Press relevance fields
  analysis_status TEXT DEFAULT 'pending',
  press_score FLOAT,
  public_accessibility FLOAT,
  societal_relevance FLOAT,
  novelty_factor FLOAT,
  storytelling_potential FLOAT,
  media_timeliness FLOAT,
  pitch_suggestion TEXT,
  target_audience TEXT,
  suggested_angle TEXT,
  reasoning TEXT,
  llm_model TEXT,
  analysis_cost FLOAT,
  -- Metadata
  import_batch TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pub_doi ON publications(doi);
CREATE INDEX IF NOT EXISTS idx_pub_analysis ON publications(analysis_status);
CREATE INDEX IF NOT EXISTS idx_pub_enrichment ON publications(enrichment_status);
CREATE INDEX IF NOT EXISTS idx_pub_score ON publications(press_score DESC);
CREATE INDEX IF NOT EXISTS idx_pub_date ON publications(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_pub_title ON publications USING gin(title gin_trgm_ops);

ALTER TABLE publications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'publications' AND policyname = 'Allow all access'
  ) THEN
    CREATE POLICY "Allow all access" ON publications
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END$$;
