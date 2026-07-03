-- Lock down event_score_weights to match every other public table: RLS enabled
-- with no policy = default-deny for anon/authenticated (PostgREST), while the
-- app's owner/service connection bypasses RLS. The original create migration
-- (20260626000001) shipped without this; the Supabase security linter flagged
-- it as the only rls_disabled_in_public table, and anon held SELECT/INSERT/
-- UPDATE. Mirrors 20260615000003_rls_sensitive_tables.sql.
ALTER TABLE event_score_weights ENABLE ROW LEVEL SECURITY;
