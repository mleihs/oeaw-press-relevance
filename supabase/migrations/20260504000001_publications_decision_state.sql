-- Decision-state + flagging fields for the triage loop (see TRIAGE_LOOP_PLAN.md).
--
-- decision: per-pub triage outcome; default 'undecided' for all 38k+ pubs.
-- The /review queue filters down via flags + scores + snooze_until — the
-- column itself stays cheap (TEXT + index).
--
-- decided_by: free text ("team", "marie") — no users-FK yet (see H8 stub).
-- flag_count + flag_notes: stacked async pre-meeting flags. flag_notes is a
-- JSONB array of {by, note, at}, queryable but not relationally tied to users.

ALTER TABLE publications
  ADD COLUMN decision TEXT NOT NULL DEFAULT 'undecided'
    CHECK (decision IN ('undecided', 'pitch', 'hold', 'skip')),
  ADD COLUMN decided_at TIMESTAMPTZ,
  ADD COLUMN decided_by TEXT,
  ADD COLUMN decision_rationale TEXT,
  ADD COLUMN snooze_until DATE,
  ADD COLUMN flag_count INT NOT NULL DEFAULT 0
    CHECK (flag_count >= 0),
  ADD COLUMN flag_notes JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Decision-filter sits on every /review and /publications query.
CREATE INDEX idx_publications_decision ON publications (decision);

-- Partial index: only pubs with snooze_until SET need this lookup.
CREATE INDEX idx_publications_snooze
  ON publications (snooze_until)
  WHERE snooze_until IS NOT NULL;

COMMENT ON COLUMN publications.decision IS
  'Triage outcome: undecided (default), pitch, hold, skip. Set in /review.';
COMMENT ON COLUMN publications.decided_by IS
  'Free text: "team" or person name. No FK to users until Auth lands (H8 stub).';
COMMENT ON COLUMN publications.flag_notes IS
  'JSONB array of {by: text, note: text, at: timestamptz}. Stacks across team members.';
