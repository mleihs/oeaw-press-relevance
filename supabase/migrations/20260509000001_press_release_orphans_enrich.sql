-- Erweitert press_release_orphans um Paper-Metadaten, damit das Press-Team die Studien
-- direkt im UI lesen + bewerten kann (auch ohne dass sie als publications importiert sind).
--
-- Quelle: OpenAlex / CrossRef per DOI. Befüllt durch scripts/enrich-orphans.mjs.

ALTER TABLE press_release_orphans
  ADD COLUMN paper_title TEXT,        -- der echte Paper-Titel (vs. news_title = Pressemeldung-Headline)
  ADD COLUMN abstract TEXT,
  ADD COLUMN authors TEXT[],          -- normalisierte Autorenliste (full names)
  ADD COLUMN journal TEXT,
  ADD COLUMN paper_year SMALLINT,
  ADD COLUMN keywords TEXT[],
  ADD COLUMN openalex_id TEXT,        -- W-prefixed OpenAlex work-id für Cross-Reference
  ADD COLUMN enrichment_status TEXT
    CHECK (enrichment_status IS NULL OR enrichment_status IN ('pending','enriched','partial','failed')),
  ADD COLUMN enriched_at TIMESTAMPTZ;

COMMENT ON COLUMN press_release_orphans.paper_title IS
  'Echter Paper-Titel (aus OpenAlex). Unterscheidet sich vom news_title (Pressemeldung-Headline).';
COMMENT ON COLUMN press_release_orphans.openalex_id IS
  'W-prefixed OpenAlex work-id, z.B. W4408432189 — für direkten Link auf openalex.org/works/<id>.';
