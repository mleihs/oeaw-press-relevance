-- Event-score weighting HISTORY (append-only). The "current" weights are the
-- latest row (max created_at). Saving new weights inserts a row; reverting to an
-- older config re-applies it as a new row, so the timeline stays linear and
-- auditable. The overall events.event_score is a weighted sum of the four stored
-- sub-scores, recomputed in application code over the existing rows whenever the
-- weights change (the sub-scores are stored, so no LLM re-run is needed).
CREATE TABLE IF NOT EXISTS event_score_weights (
  id                       bigserial PRIMARY KEY,
  public_appeal            double precision NOT NULL,
  scientific_significance  double precision NOT NULL,
  reach                    double precision NOT NULL,
  timeliness               double precision NOT NULL,
  note                     text,
  recomputed_count         integer,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_score_weights_created_at
  ON event_score_weights (created_at DESC);

-- Seed the current defaults (lib/shared/event-score-weights.json) as entry #1.
INSERT INTO event_score_weights (public_appeal, scientific_significance, reach, timeliness, note)
SELECT 0.35, 0.30, 0.20, 0.15, 'Standard'
WHERE NOT EXISTS (SELECT 1 FROM event_score_weights);
