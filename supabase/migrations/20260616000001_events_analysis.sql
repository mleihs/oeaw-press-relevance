-- LLM relevance scoring + pitch for events (analog zu Publikationen).
-- Adds the analysis column set to `events`. New columns default to NULL /
-- 'pending' and are NOT in the events-sync UPSERT SET list, so they survive
-- re-sync (same preservation as decision/flag columns).

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS analysis_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS event_score double precision,
  ADD COLUMN IF NOT EXISTS public_appeal double precision,
  ADD COLUMN IF NOT EXISTS scientific_significance double precision,
  ADD COLUMN IF NOT EXISTS reach double precision,
  ADD COLUMN IF NOT EXISTS timeliness double precision,
  ADD COLUMN IF NOT EXISTS pitch_suggestion text,
  ADD COLUMN IF NOT EXISTS suggested_angle text,
  ADD COLUMN IF NOT EXISTS target_audience text,
  ADD COLUMN IF NOT EXISTS reasoning text,
  ADD COLUMN IF NOT EXISTS llm_model text,
  ADD COLUMN IF NOT EXISTS analysis_cost double precision,
  ADD COLUMN IF NOT EXISTS analyzed_at timestamptz;

-- Range guards (0..1) mirroring the publications constraints. Drop-then-add so
-- the migration is re-runnable.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_analysis_status_check;
ALTER TABLE events ADD CONSTRAINT events_analysis_status_check
  CHECK (analysis_status IS NULL OR analysis_status = ANY (ARRAY['pending','analyzed','failed']));

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_score_range_check;
ALTER TABLE events ADD CONSTRAINT events_score_range_check CHECK (
  (event_score IS NULL OR (event_score >= 0 AND event_score <= 1)) AND
  (public_appeal IS NULL OR (public_appeal >= 0 AND public_appeal <= 1)) AND
  (scientific_significance IS NULL OR (scientific_significance >= 0 AND scientific_significance <= 1)) AND
  (reach IS NULL OR (reach >= 0 AND reach <= 1)) AND
  (timeliness IS NULL OR (timeliness >= 0 AND timeliness <= 1))
);

CREATE INDEX IF NOT EXISTS idx_events_analysis ON events (analysis_status);
CREATE INDEX IF NOT EXISTS idx_events_analysis_score ON events (analysis_status, event_score DESC);
