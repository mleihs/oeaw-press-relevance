-- Enable Row Level Security (default-deny) on tables that had RLS OFF.
--
-- Why this is safe: the application connects to Postgres exclusively via the
-- `postgres` owner role (DATABASE_URL / postgres-js + Drizzle). Table owners
-- BYPASS RLS, so enabling RLS here does NOT affect any app query. The Supabase
-- anon-client path (getSupabaseFromRequest) is dead code with zero call sites,
-- so nothing reads these tables through PostgREST as the `anon` role.
--
-- What it fixes: defense-in-depth for the published Supabase anon key. With RLS
-- enabled and NO policy granted to `anon`, the anon role is denied all access to
-- these tables via PostgREST — so even if the anon key were ever exposed in a
-- client bundle, the sensitive data below cannot be read outside the gate.
--
-- NOTE: plain ENABLE (not FORCE) ROW LEVEL SECURITY — FORCE would also restrict
-- the table owner, which would break the app. The 20 reference/publication
-- tables that intentionally carry an `anon_select` policy are left unchanged.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE press_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE press_release_promote_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE publication_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE press_cluster_centroid ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE press_release_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_theme_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_refresh_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_settings ENABLE ROW LEVEL SECURITY;
</content>
