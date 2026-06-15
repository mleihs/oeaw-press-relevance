-- Global, team-wide settings for the social monitor (singleton row). The
-- per-channel lookback (social_channels.lookback_days) and the SOCIAL_* env
-- vars remain; this table holds the in-app-editable global knobs:
--   fresh_window_days  posts newer than this show by default; older ones sit
--                      behind a "show older" control / time-range filter
--   theme_window_days  window of posts fed to the LLM theme snapshot on refresh
--                      (decoupled from display/lookback)
--   retention_days     NULL = keep everything; else prune posts older than this
--                      on refresh (bounds DB growth)

create table if not exists social_settings (
  id smallint primary key default 1,
  fresh_window_days integer not null default 7,
  theme_window_days integer not null default 14,
  retention_days integer,
  updated_at timestamptz not null default now(),
  constraint social_settings_singleton check (id = 1),
  constraint social_settings_fresh_check check (fresh_window_days between 1 and 365),
  constraint social_settings_theme_check check (theme_window_days between 1 and 365),
  constraint social_settings_retention_check check (retention_days is null or retention_days between 1 and 3650)
);

insert into social_settings (id) values (1) on conflict (id) do nothing;
