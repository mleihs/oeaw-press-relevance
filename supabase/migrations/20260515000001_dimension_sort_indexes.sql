-- Dashboard radar click-to-sort triggers ORDER BY <dimension> DESC NULLS LAST
-- on publications. press_score and published_at already have indexes; the 5
-- LLM dimension columns added 2026-05-14 did not, so every axis click ran a
-- full table scan over ~7.4k rows. Mirror the press_score pattern.

CREATE INDEX IF NOT EXISTS idx_pub_public_accessibility
  ON publications (public_accessibility DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_pub_societal_relevance
  ON publications (societal_relevance DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_pub_novelty_factor
  ON publications (novelty_factor DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_pub_storytelling_potential
  ON publications (storytelling_potential DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_pub_media_timeliness
  ON publications (media_timeliness DESC NULLS LAST);
