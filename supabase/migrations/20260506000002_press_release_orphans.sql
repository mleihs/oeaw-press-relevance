-- Press-releases on the ÖAW-Hauptseite that reference a DOI which is NOT
-- in our publications table. WebDB doesn't cover 100% of OeAW publications.
-- Typical reasons a paper falls into orphans:
--   - paper published after the last WebDB sync
--   - institute didn't enter the paper into WebDB (Pflege-Lücke)
--   - OeAW-author was co-author and the affiliation was not flagged in WebDB
--   - DOI typo in the press text (rare)
-- In most cases an OeAW-author IS on the paper (Lead or Co-Author) — they
-- just couldn't be linked to a publications-row because the row doesn't exist.
--
-- Kept separately from `publications` because they are NOT publications in
-- the StoryScout sense — they are press-release records that floated free.
-- Later pipeline runs promote orphans into matches once the pub gets imported
-- (see promote_press_release_orphans() called from webdb-import.mjs).
--
-- NOTE: superseded by 20260509000003 (consolidated into press_releases table).
-- This file remains for migration history only.

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
