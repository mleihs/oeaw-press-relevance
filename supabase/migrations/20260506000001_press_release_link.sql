-- Cross-reference link from publications to existing ÖAW-Hauptseite press releases.
-- Source: TYPO3 news (sys_category 64 'ÖAW-Pressemeldungen' / 1748 'OeAW press release'),
-- matched against publications.doi.
--
-- Use case: the press team should NOT re-pitch a paper that already has a
-- press release. The badge in the UI says "schon released" + links to the
-- existing news page. /review-queue can later filter these out via the
-- press_released=false param.
--
-- One row per publication = one (preferred) URL — German wins over English
-- when both translations exist. Lang is kept so the UI can render the right
-- flag/locale icon. Title is denormalised for tooltip display (no API
-- roundtrip needed for hover).

ALTER TABLE publications
  ADD COLUMN press_release_url TEXT,
  ADD COLUMN press_release_at DATE,
  ADD COLUMN press_release_lang TEXT
    CHECK (press_release_lang IS NULL OR press_release_lang IN ('de', 'en')),
  ADD COLUMN press_release_title TEXT;

-- Partial index: most pubs will not have a press release, so the index only
-- pays for itself on the small subset where it's set.
CREATE INDEX idx_publications_press_release
  ON publications (press_release_url)
  WHERE press_release_url IS NOT NULL;

COMMENT ON COLUMN publications.press_release_url IS
  'Public URL of the ÖAW-Hauptseite press release referencing this publication. NULL = no known release. Source: TYPO3 sys_category 64+1748 + tx_news_domain_model_news.bodytext-DOI-match.';
COMMENT ON COLUMN publications.press_release_lang IS
  'de | en — preferred URL when both language variants exist (de wins).';
