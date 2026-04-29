-- Multi-user foundation stub: schema only, no UI / Auth wiring yet.
--
-- Today the app is gated by a single shared password (middleware.ts) and
-- per-user prefs live in localStorage. This migration lays the schema so
-- the next step (Supabase Auth + DB-backed user_settings) doesn't have to
-- co-design tables and UI in one breath.
--
-- Until UI is wired:
--   * No row insertion happens automatically.
--   * Mutations gated behind getSupabaseAdmin() (service-role) — the only
--     client able to write here.
--   * RLS is enabled with NO policies, so anon/authenticated-via-Supabase-
--     Auth roles can read nothing. Service-role bypasses RLS, so server-
--     side seeding still works once we wire it.

CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT UNIQUE NOT NULL,
  display_name TEXT,
  role         TEXT NOT NULL DEFAULT 'editor'
                 CHECK (role IN ('admin', 'editor', 'viewer')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

CREATE TABLE user_settings (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  openrouter_api_key   TEXT,                                 -- BYOK (cost ownership)
  llm_default_model    TEXT,                                 -- per-user preferred model
  min_word_count       INT NOT NULL DEFAULT 100,
  batch_size           INT NOT NULL DEFAULT 3
                         CHECK (batch_size BETWEEN 1 AND 5),
  info_bubbles_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keep updated_at in sync on UPDATE. (DEFAULT NOW() only fires on INSERT.)
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER user_settings_set_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- RLS lockdown — no policies until Supabase Auth is wired.
-- Once auth.uid() exists, add: SELECT/UPDATE WHERE auth.uid()::text = id::text
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE users IS
  'Multi-user foundation stub (migration 20260429000004). UI not wired; access via service-role only.';
COMMENT ON TABLE user_settings IS
  'Per-user prefs migration target for localStorage AppSettings. Wire from /settings when Supabase Auth lands.';
