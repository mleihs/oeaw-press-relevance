-- Board-Labels (MeisterTask-Pendant „Tags"): farbige, pro Board definierte
-- Etiketten, die an Karten n:m hängen. Analog zu MeisterTask, wo Labels
-- projekt-scoped sind. Gleiche Konventionen wie board_core
-- (20260703000002): fraktionale Ranks (rank.ts-Invariante), RLS als
-- Realtime-Vorbereitung + Defense-in-Depth, Schreibpfad über Drizzle/owner.

-- ---------------------------------------------------------------------------
-- board_labels — Label-Definition je Board (Name + Hex-Farbe).
-- ---------------------------------------------------------------------------
create table board_labels (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null,
  name       text not null,
  color      text not null default '#64748b',
  rank       text not null,
  created_at timestamptz not null default now(),
  constraint board_labels_board_id_fkey foreign key (board_id)
    references boards (id) on delete cascade,
  constraint board_labels_name_check check (btrim(name) <> ''),
  constraint board_labels_color_check check (color ~ '^#[0-9a-fA-F]{6}$'),
  constraint board_labels_rank_check check (rank ~ '^[a-z]*[b-z]$'),
  constraint board_labels_board_rank_key unique (board_id, rank)
);
create index idx_board_labels_board on board_labels (board_id, rank);

-- ---------------------------------------------------------------------------
-- card_labels — n:m Karte ↔ Label. Beide Seiten cascaden.
-- ---------------------------------------------------------------------------
create table card_labels (
  card_id  uuid not null,
  label_id uuid not null,
  created_at timestamptz not null default now(),
  constraint card_labels_card_id_fkey foreign key (card_id)
    references cards (id) on delete cascade,
  constraint card_labels_label_id_fkey foreign key (label_id)
    references board_labels (id) on delete cascade,
  constraint card_labels_pkey primary key (card_id, label_id)
);
create index idx_card_labels_label on card_labels (label_id);

-- RLS: team-weit lesbar (wie alle Board-Tabellen), Schreiben nur über owner.
alter table board_labels enable row level security;
alter table card_labels  enable row level security;
create policy authenticated_select on board_labels for select to authenticated using (true);
create policy authenticated_select on card_labels  for select to authenticated using (true);

-- Realtime: card_labels wird im Board live konsumiert (Chip-Update ohne
-- Reload). REPLICA IDENTITY FULL, damit das DELETE-Event card_id + label_id
-- trägt. board_labels ändert sich selten (admin/import) → nicht publiziert.
alter table card_labels replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'card_labels'
  ) then
    alter publication supabase_realtime add table public.card_labels;
  end if;
end $$;
