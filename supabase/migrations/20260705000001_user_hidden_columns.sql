-- Per-Nutzer-Sichtbarkeit einzelner Kanäle („Für mich ausblenden" am
-- Kanalkopf). „Für mich" ⇒ pro User, cross-device ⇒ DB-Tabelle (nicht
-- localStorage). Reine Präferenz, analog user_board_favorites
-- (20260703000002): team-weit lesbar (RLS), Schreibpfad über owner.

create table user_hidden_columns (
  user_id    uuid not null,
  column_id  uuid not null,
  created_at timestamptz not null default now(),
  constraint user_hidden_columns_user_id_fkey foreign key (user_id)
    references users (id) on delete cascade,
  constraint user_hidden_columns_column_id_fkey foreign key (column_id)
    references board_columns (id) on delete cascade,
  constraint user_hidden_columns_pkey primary key (user_id, column_id)
);
create index idx_user_hidden_columns_user on user_hidden_columns (user_id);

-- RLS: team-weit lesbar (wie alle Board-Tabellen), Schreiben nur über owner.
-- Per-User-lokal → nicht realtime-publiziert (kein Live-Bedarf über Geräte
-- hinweg; ein Reload zieht den Stand).
alter table user_hidden_columns enable row level security;
create policy authenticated_select on user_hidden_columns for select to authenticated using (true);
