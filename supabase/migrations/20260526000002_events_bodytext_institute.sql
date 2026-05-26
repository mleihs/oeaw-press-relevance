-- Extends the events mirror with two fields that turn /events/[id] into a
-- useful detail page:
--   - bodytext: full TYPO3-news body (rich text, often HTML). Needed for the
--     detail view; the list view keeps using `teaser` and never selects this.
--   - institute: TYPO3 site-root page title above the news folder. Derived
--     via WITH RECURSIVE in the sync adapter (walk pages.pid until
--     is_siteroot=1). Examples: 'GMI', 'IWF', 'ACDH', 'ITA'.

ALTER TABLE events
  ADD COLUMN bodytext TEXT,
  ADD COLUMN institute TEXT;

CREATE INDEX idx_events_institute ON events (institute) WHERE institute IS NOT NULL;

COMMENT ON COLUMN events.bodytext IS
  'Full body text from tx_news_domain_model_news.bodytext. Rich-text (TYPO3 RTE output, may contain HTML). Rendered only on the detail page; sanitise at render time.';
COMMENT ON COLUMN events.institute IS
  'TYPO3 site-root page title above the news folder (e.g. GMI, IWF). Derived via recursive page-tree walk in the sync adapter — not a normalised foreign key, just a denormalised label for the UI.';
