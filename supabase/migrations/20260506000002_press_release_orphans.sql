-- Press-releases on the ÖAW-Hauptseite that reference a DOI which is NOT
-- in our publications table. These are typically:
--   - external collaborator-led studies where no OeAW author is the lead
--     (so the paper never lands in WebDB and thus not in our import)
--   - very recent papers not yet imported
--   - DOI typos in the press text
--
-- Kept separately from `publications` because they are NOT publications in
-- the StoryScout sense — they are press-release records that floated free.
-- The dashboard surfaces the count + list as a "Press releases ohne
-- WebDB-Match" panel; later pipeline runs can promote orphans into matches
-- once the pub is imported (DELETE FROM orphans WHERE doi=... after match).

CREATE TABLE press_release_orphans (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doi                  TEXT NOT NULL UNIQUE,
  press_release_url    TEXT NOT NULL,
  press_release_at     DATE,
  press_release_lang   TEXT CHECK (press_release_lang IS NULL OR press_release_lang IN ('de','en')),
  press_release_title  TEXT,           -- the *paper* title, if available
  news_title           TEXT,           -- the news-headline (German); often different
  source_news_uid      INT,            -- TYPO3 tx_news_domain_model_news.uid
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_press_release_orphans_doi ON press_release_orphans (LOWER(doi));
CREATE INDEX idx_press_release_orphans_at ON press_release_orphans (press_release_at DESC);

COMMENT ON TABLE press_release_orphans IS
  'TYPO3 ÖAW-Hauptseite press-news with DOIs not yet in our publications table. Surfaces in the dashboard so the team can track which papers are press-released but missing from StoryScout.';
