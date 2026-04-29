-- MeisterTask deep-link tokens.
--
-- The numeric task id stored by 20260429000005 is the canonical reference for
-- API calls (GET /tasks/{id}, etc.) but the MeisterTask web UI deep-link uses
-- a separate short token: /app/task/{token} (e.g. /app/task/u9Qg4K51). The
-- /app/task/{numeric_id} route exists but renders a "Zugriff nicht möglich"
-- error page — only the token form opens the actual task.
--
-- We store the token alongside the id so the UI can build the deep-link
-- without an extra API roundtrip.

ALTER TABLE publications
  ADD COLUMN meistertask_task_token TEXT NULL;

COMMENT ON COLUMN publications.meistertask_task_token IS
  'MeisterTask URL token for /app/task/<token> deep links. Set together with meistertask_task_id by /api/meistertask/push.';
