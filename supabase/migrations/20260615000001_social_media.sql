-- Social-media monitoring ("Lagebild" — /social).
--
-- Four tables:
--   social_channels        configured IG accounts to watch (managed via Settings)
--   social_posts           fetched posts (UPSERT on (channel_id, external_id);
--                          LLM analysis columns are preserved on re-sync)
--   social_theme_snapshots  aggregated topic overview, one row per refresh
--   social_refresh_runs     cost + run log; also drives the refresh throttle
--
-- The /social page is a pure DB read; Apify + LLM cost is incurred only on an
-- explicit refresh. See lib/server/social/.

create table if not exists social_channels (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'instagram',
  handle text not null,
  display_name text,
  url text not null,
  active boolean not null default true,
  -- Per-channel look-back override (days). NULL = inherit SOCIAL_WINDOW_DAYS.
  lookback_days integer,
  created_at timestamptz not null default now(),
  constraint social_channels_platform_check check (platform = 'instagram'),
  constraint social_channels_lookback_days_check
    check (lookback_days is null or (lookback_days >= 1 and lookback_days <= 365)),
  constraint social_channels_platform_handle_key unique (platform, handle)
);
-- Idempotent for environments where the table predates this column.
alter table social_channels add column if not exists lookback_days integer;

create table if not exists social_posts (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references social_channels(id) on delete cascade,
  external_id text not null,
  url text,
  posted_at timestamptz,
  caption text,
  like_count integer,
  comment_count integer,
  media_type text,
  image_url text,
  raw jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  topic text,
  keywords text[] not null default '{}',
  summary_de text,
  analysis_status text not null default 'pending',
  llm_model text,
  analyzed_at timestamptz,
  constraint social_posts_channel_external_key unique (channel_id, external_id),
  constraint social_posts_analysis_status_check
    check (analysis_status = any (array['pending', 'analyzed', 'failed']))
);
create index if not exists idx_social_posts_posted_at
  on social_posts using btree (posted_at desc nulls last);
create index if not exists idx_social_posts_analysis_status
  on social_posts using btree (analysis_status);
create index if not exists idx_social_posts_channel
  on social_posts using btree (channel_id);

create table if not exists social_theme_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  window_days integer not null,
  post_count integer not null default 0,
  channel_count integer not null default 0,
  themes jsonb not null default '[]'::jsonb,
  narrative_de text,
  llm_model text
);
create index if not exists idx_social_theme_snapshots_created_at
  on social_theme_snapshots using btree (created_at desc);

create table if not exists social_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  triggered_by text not null default 'ui',
  posts_fetched integer not null default 0,
  posts_new integer not null default 0,
  posts_analyzed integer not null default 0,
  apify_cost_usd double precision not null default 0,
  llm_cost_usd double precision not null default 0,
  llm_tokens integer not null default 0,
  llm_model text,
  duration_ms integer,
  status text not null default 'complete',
  error text,
  constraint social_refresh_runs_status_check
    check (status = any (array['complete', 'error', 'skipped']))
);
create index if not exists idx_social_refresh_runs_created_at
  on social_refresh_runs using btree (created_at desc);

-- Seed the initial monitored channels (idempotent — editable later via Settings).
insert into social_channels (platform, handle, display_name, url) values
  ('instagram', 'wasbishergeschah.at_history', 'Was bisher geschah · History', 'https://www.instagram.com/wasbishergeschah.at_history/'),
  ('instagram', 'quarks.de', 'Quarks', 'https://www.instagram.com/quarks.de/'),
  ('instagram', 'vista.science', 'Vista Science', 'https://www.instagram.com/vista.science/')
on conflict (platform, handle) do nothing;
