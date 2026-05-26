-- Local mirror of upcoming TYPO3 events from the OEAW WEBDB.
-- Source: tx_news_domain_model_news WHERE is_event=1 (EXT:news_eventnews).
--
-- Re-populated on demand via POST /api/events/sync (no cron). The UPSERT
-- only touches the WebDB-sourced columns, so the maintainer-state
-- (decision, decided_at, flag_notes) is preserved across syncs.
--
-- Decision-state + flag_notes mirror the publications triage model
-- (20260504000001 + 20260504000003) — same string CHECK, same JSONB shape.
-- Feature overview: docs/EVENTS_FEATURE.md.

CREATE TABLE events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webdb_uid        INT UNIQUE NOT NULL,
  title            TEXT NOT NULL,
  teaser           TEXT,
  event_at         TIMESTAMPTZ NOT NULL,
  event_end_at     TIMESTAMPTZ,
  location_title   TEXT,
  organizer_title  TEXT,
  url              TEXT,
  lang             TEXT CHECK (lang IS NULL OR lang IN ('de','en','mul')),
  decision         TEXT NOT NULL DEFAULT 'undecided'
    CHECK (decision IN ('undecided','pitch','hold','skip')),
  decided_at       TIMESTAMPTZ,
  flag_notes       JSONB NOT NULL DEFAULT '[]'::jsonb,
  synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_event_at ON events (event_at);
CREATE INDEX idx_events_decision ON events (decision);

-- The publications_decided_at_sync function from 20260504000003 only reads
-- NEW.decision and writes NEW.decided_at — no publications-specific logic.
-- Reused verbatim here.
CREATE TRIGGER trg_events_decided_at_sync
  BEFORE UPDATE OF decision ON events
  FOR EACH ROW EXECUTE FUNCTION publications_decided_at_sync();

COMMENT ON TABLE events IS
  'Upcoming TYPO3 events from WEBDB (tx_news_domain_model_news WHERE is_event=1). Maintainer-state survives re-syncs because the UPSERT excludes decision/flag_notes columns.';
COMMENT ON COLUMN events.webdb_uid IS
  'TYPO3 tx_news_domain_model_news.uid — natural key for UPSERT.';
COMMENT ON COLUMN events.event_at IS
  'Event start (from tx_news_domain_model_news.datetime, UNIX seconds → TIMESTAMPTZ).';
COMMENT ON COLUMN events.lang IS
  'Source language. sys_language_uid: 0→de, 1→en, -1→mul (multi-language).';
