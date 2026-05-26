-- Adds the TYPO3 sidebar-info field. tx_news_domain_model_news.event_information
-- is the rich-text block editors maintain via the TYPO3 backend; it holds the
-- canonical event metadata (date, address, Zoom link, organiser, contact) the
-- frontend renders on the right column of the detail page.
--
-- Why not split into normalised columns: editors arrange these fields freely
-- per event (with sub-bullets, mailto-links, download-icons). Re-parsing the
-- HTML into structured fields would lose intent and break with the next
-- TYPO3-template change. Cheaper to mirror as-is and sanitise at render time.

ALTER TABLE events
  ADD COLUMN event_information TEXT;

COMMENT ON COLUMN events.event_information IS
  'Rich-text sidebar info from tx_news_domain_model_news.event_information. Often contains the canonical address, Zoom link, organiser, contact email and invitation-download link. Rendered HTML on the detail page after server-side sanitisation (no dangerouslySetInnerHTML in the hot path without a safelist).';
