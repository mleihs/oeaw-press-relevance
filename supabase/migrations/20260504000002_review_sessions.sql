-- Review sessions — explicit DB entity for the Friday triage meeting.
-- Per Sanity-style workflow modeling (TRIAGE_LOOP_PLAN.md §5.6 + §8 + §13.2):
-- one row per meeting, decisions link back via publications.decided_in_session.
-- This is the audit anchor for "show all pitches from session 2026-04-15"
-- and the throughput-trend-chart in Phase D.
--
-- attendees / facilitator: free text (no users-FK yet, see H8 stub).
-- A "Cycle"-style abstraction (Linear) is overengineered for a weekly meeting.

CREATE TABLE review_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at  TIMESTAMPTZ NOT NULL,
  attendees    TEXT[],
  facilitator  TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_sessions_occurred_at
  ON review_sessions (occurred_at DESC);

ALTER TABLE publications
  ADD COLUMN decided_in_session UUID REFERENCES review_sessions(id) ON DELETE SET NULL;

CREATE INDEX idx_publications_decided_in_session
  ON publications (decided_in_session)
  WHERE decided_in_session IS NOT NULL;

COMMENT ON TABLE review_sessions IS
  'Friday triage meeting record. Linked from publications.decided_in_session.';
COMMENT ON COLUMN publications.decided_in_session IS
  'FK to the review session in which this decision was made. NULL = decided outside a session.';
