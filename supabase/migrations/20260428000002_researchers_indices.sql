-- Researcher leaderboard hot path: scan analyzed publications inside a date window
-- and pull press_score. Existing indices cover analysis_status alone or score alone;
-- this partial composite trims the index to only analyzed rows with non-null score
-- and orders by published_at for the window scan.

CREATE INDEX IF NOT EXISTS idx_pub_analyzed_window
  ON publications(published_at, press_score)
  WHERE analysis_status = 'analyzed' AND press_score IS NOT NULL;
