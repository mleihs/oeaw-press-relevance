-- Adds dedup anchor for MeisterTask one-way push.
-- Set after a successful POST /sections/{id}/tasks; NULL = not yet pushed.
-- Partial index: vast majority of rows stay NULL, so a full B-tree wastes space.

ALTER TABLE publications
  ADD COLUMN meistertask_task_id TEXT NULL;

CREATE INDEX idx_publications_meistertask_task_id
  ON publications(meistertask_task_id)
  WHERE meistertask_task_id IS NOT NULL;

COMMENT ON COLUMN publications.meistertask_task_id IS
  'MeisterTask task ID after one-way push. NULL = not pushed. Set by /api/meistertask/push.';
