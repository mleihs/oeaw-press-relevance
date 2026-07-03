-- Phase 2 Redaktionsboard (BOARD_PLAN.md §4/§5): der Board-Kern. Kanban-
-- Datenmodell mit fraktionalen Ranks (LexoRank-Stil, lib/shared/rank.ts),
-- append-only Aktivitätslog und harten DB-Invarianten. Identität kommt aus
-- public.users (Phase 1). Schreibpfad läuft ausschließlich über Drizzle
-- (owner-Rolle, an RLS vorbei); die App autorisiert selbst via requireUser/
-- requireAdmin — RLS ist Realtime-Vorbereitung (Phase 3) + Defense-in-Depth
-- gegen den veröffentlichten anon-Key.
--
-- Kernentscheidungen, die sich später nicht nachrüsten lassen und deshalb
-- hier sofort richtig gebaut werden (§3.2):
--   * Ranks als text COLLATE "C" NOT NULL CHECK (~ '^[a-z]*[b-z]$'): bytewise
--     Collation, damit ORDER BY rank exakt dem JS-Codeunit-Vergleich in
--     rank.ts entspricht; der CHECK erzwingt die Modul-Invariante (nie auf
--     'a' endend). UNIQUE je Geltungsbereich macht Race-Kollisionen zweier
--     paralleler Moves zu einem retrybaren 23505 statt stiller Fehlordnung.
--   * card_activity append-only per Trigger (RLS allein reicht nicht, weil
--     der service-role-Drizzle-Pfad an RLS vorbeigeht).

-- ---------------------------------------------------------------------------
-- Gemeinsame Trigger-Funktionen
-- ---------------------------------------------------------------------------

-- updated_at DB-seitig pflegen (gilt damit auch für Realtime-/SQL-Schreib-
-- pfade, nicht nur App-Code). Eigene Funktion statt moddatetime-Extension —
-- self-contained, wie trg_events_decided_at_sync.
create or replace function public.board_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Append-only-Guard für card_activity. BEFORE UPDATE feuert immer -> raise
-- (kein legitimer Cascade-UPDATE-Pfad existiert). BEFORE DELETE unterscheidet
-- direkten Delete (pg_trigger_depth() = 1 -> verboten) vom FK-Cascade beim
-- Löschen der Karte (depth >= 2 -> erlaubt). Die Tiefen sind empirisch gegen
-- den lokalen Stack verifiziert (direkt = 1, Cascade via DELETE cards = 2).
create or replace function public.card_activity_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then
      return old; -- Cascade vom Kartenlöschen — durchlassen
    end if;
    raise exception 'card_activity ist append-only: direkte DELETEs sind nicht erlaubt';
  end if;
  raise exception 'card_activity ist append-only: UPDATEs sind nicht erlaubt';
end;
$$;

-- ---------------------------------------------------------------------------
-- boards — ein Board = eine MeisterTask-Projektliste (Channels + Nebenboards).
-- Boards werden archiviert (archived_at), nicht gelöscht.
-- ---------------------------------------------------------------------------
create table boards (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null,
  rank        text collate "C" not null,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint boards_slug_key unique (slug),
  constraint boards_rank_check check (rank ~ '^[a-z]*[b-z]$'),
  constraint boards_name_check check (btrim(name) <> ''),
  constraint boards_slug_format_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create trigger trg_boards_updated_at
  before update on boards
  for each row execute function public.board_set_updated_at();

-- ---------------------------------------------------------------------------
-- board_columns — Spalten = Ausspielkanäle. Reihenfolge per rank (Drag lebt in
-- der Verwaltung). Farbe als Hex-String (Client mappt Kanalname -> Icon).
-- ---------------------------------------------------------------------------
create table board_columns (
  id        uuid primary key default gen_random_uuid(),
  board_id  uuid not null,
  name      text not null,
  color     text not null default '#64748b',
  rank      text collate "C" not null,
  created_at timestamptz not null default now(),
  constraint board_columns_board_id_fkey foreign key (board_id)
    references boards (id) on delete cascade,
  constraint board_columns_rank_check check (rank ~ '^[a-z]*[b-z]$'),
  constraint board_columns_name_check check (btrim(name) <> ''),
  constraint board_columns_color_check check (color ~ '^#[0-9a-fA-F]{6}$'),
  constraint board_columns_board_rank_key unique (board_id, rank)
);

-- ---------------------------------------------------------------------------
-- cards — Karte = Thema/Story. column_id/board_id ON DELETE RESTRICT: die DB
-- garantiert hart, dass eine Spalte/ein Board mit Karten nicht gelöscht wird
-- (das „Spalte enthält Karten"-Warnmodal im Design ist die UI dazu). Autoren-
-- FKs RESTRICT — Nutzer werden nie gelöscht, nur deaktiviert (§3.1).
-- converted_from_item_id-FK wird nach card_items ergänzt (Zyklus auflösen).
-- ---------------------------------------------------------------------------
create table cards (
  id                    uuid primary key default gen_random_uuid(),
  board_id              uuid not null,
  column_id             uuid not null,
  title                 text not null,
  description_md        text,
  link_url              text,
  rank                  text collate "C" not null,
  due_at                timestamptz,
  completed_at          timestamptz,
  created_by            uuid not null,
  assignee_id           uuid,
  converted_from_item_id uuid,
  source_event_id       uuid,
  source_publication_id uuid,
  meistertask_task_id   text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint cards_board_id_fkey foreign key (board_id)
    references boards (id) on delete restrict,
  constraint cards_column_id_fkey foreign key (column_id)
    references board_columns (id) on delete restrict,
  constraint cards_created_by_fkey foreign key (created_by)
    references users (id) on delete restrict,
  constraint cards_assignee_id_fkey foreign key (assignee_id)
    references users (id) on delete restrict,
  constraint cards_source_event_id_fkey foreign key (source_event_id)
    references events (id) on delete set null,
  constraint cards_source_publication_id_fkey foreign key (source_publication_id)
    references publications (id) on delete set null,
  constraint cards_rank_check check (rank ~ '^[a-z]*[b-z]$'),
  constraint cards_title_check check (btrim(title) <> ''),
  constraint cards_column_rank_key unique (column_id, rank)
);

create trigger trg_cards_updated_at
  before update on cards
  for each row execute function public.board_set_updated_at();

-- ---------------------------------------------------------------------------
-- card_items — Checkliste UND Unteraufgaben in einer Tabelle (kind), gleiches
-- Verhalten (Text, abhakbar, Rank), nur andere Darstellung.
-- ---------------------------------------------------------------------------
create table card_items (
  id        uuid primary key default gen_random_uuid(),
  card_id   uuid not null,
  kind      text not null,
  text      text not null,
  rank      text collate "C" not null,
  done_at   timestamptz,
  done_by   uuid,
  created_at timestamptz not null default now(),
  constraint card_items_card_id_fkey foreign key (card_id)
    references cards (id) on delete cascade,
  constraint card_items_done_by_fkey foreign key (done_by)
    references users (id) on delete restrict,
  constraint card_items_kind_check check (kind in ('checklist', 'subtask')),
  constraint card_items_rank_check check (rank ~ '^[a-z]*[b-z]$'),
  constraint card_items_text_check check (btrim(text) <> ''),
  constraint card_items_card_rank_key unique (card_id, rank)
);

-- Jetzt, wo card_items existiert: die Rück-Verknüpfung „Karte entstand aus
-- dieser Unteraufgabe". SET NULL, weil die Ursprungs-Unteraufgabe mit ihrer
-- Karte verschwinden kann, die abgeleitete Karte aber bleibt.
alter table cards
  add constraint cards_converted_from_item_id_fkey
  foreign key (converted_from_item_id)
  references card_items (id) on delete set null;

-- ---------------------------------------------------------------------------
-- card_watchers — Beobachter (MT-Kultur: Beobachten statt Zuweisen). Kein
-- Autorschafts-Bezug -> CASCADE auf beide Seiten.
-- ---------------------------------------------------------------------------
create table card_watchers (
  card_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  constraint card_watchers_card_id_fkey foreign key (card_id)
    references cards (id) on delete cascade,
  constraint card_watchers_user_id_fkey foreign key (user_id)
    references users (id) on delete cascade,
  constraint card_watchers_pkey primary key (card_id, user_id)
);

-- ---------------------------------------------------------------------------
-- card_comments — Kommentarstrang (Phase 3). author_id RESTRICT: Autorschaft
-- überlebt Personalwechsel.
-- ---------------------------------------------------------------------------
create table card_comments (
  id        uuid primary key default gen_random_uuid(),
  card_id   uuid not null,
  author_id uuid not null,
  body_md   text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint card_comments_card_id_fkey foreign key (card_id)
    references cards (id) on delete cascade,
  constraint card_comments_author_id_fkey foreign key (author_id)
    references users (id) on delete restrict,
  constraint card_comments_body_check check (btrim(body_md) <> '')
);

-- ---------------------------------------------------------------------------
-- card_attachments — Anhänge (Phase 3). Blob strikt in MinIO, nur der s3_key
-- in der DB (Free-Tier-Speicher, §6).
-- ---------------------------------------------------------------------------
create table card_attachments (
  id           uuid primary key default gen_random_uuid(),
  card_id      uuid not null,
  filename     text not null,
  s3_key       text not null,
  content_type text,
  size_bytes   bigint,
  uploaded_by  uuid not null,
  created_at   timestamptz not null default now(),
  constraint card_attachments_card_id_fkey foreign key (card_id)
    references cards (id) on delete cascade,
  constraint card_attachments_uploaded_by_fkey foreign key (uploaded_by)
    references users (id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- card_activity — append-only Aktivitätslog (bigserial, verb + payload jsonb).
-- Wird nie mutiert (Trigger unten). actor_id RESTRICT.
-- ---------------------------------------------------------------------------
create table card_activity (
  id         bigserial primary key,
  card_id    uuid not null,
  actor_id   uuid not null,
  verb       text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint card_activity_card_id_fkey foreign key (card_id)
    references cards (id) on delete cascade,
  constraint card_activity_actor_id_fkey foreign key (actor_id)
    references users (id) on delete restrict
);

create trigger trg_card_activity_no_update
  before update on card_activity
  for each row execute function public.card_activity_append_only();

create trigger trg_card_activity_no_delete
  before delete on card_activity
  for each row execute function public.card_activity_append_only();

-- ---------------------------------------------------------------------------
-- user_board_favorites — Stern im Switcher/Übersicht. Reine Präferenz -> beide
-- Seiten CASCADE.
-- ---------------------------------------------------------------------------
create table user_board_favorites (
  user_id  uuid not null,
  board_id uuid not null,
  created_at timestamptz not null default now(),
  constraint user_board_favorites_user_id_fkey foreign key (user_id)
    references users (id) on delete cascade,
  constraint user_board_favorites_board_id_fkey foreign key (board_id)
    references boards (id) on delete cascade,
  constraint user_board_favorites_pkey primary key (user_id, board_id)
);

-- ---------------------------------------------------------------------------
-- Indizes (§4). Die UNIQUE-Constraints (column_id,rank)/(board_id,rank)/
-- (card_id,rank) liefern ihren Sortier-Index gleich mit; hier nur, was
-- Queries zusätzlich brauchen — moderat gehalten (Free-Tier, s. Memory
-- prod-supabase-free-tier-500mb).
-- ---------------------------------------------------------------------------
create index idx_cards_board_col_rank on cards (board_id, column_id, rank);
create index idx_cards_due on cards (due_at)
  where due_at is not null and completed_at is null;
create index idx_cards_assignee on cards (assignee_id)
  where assignee_id is not null;
create index idx_cards_source_event on cards (source_event_id)
  where source_event_id is not null;
-- Höchstens eine Karte pro umgewandelter Unteraufgabe (Doppel-Convert-Schutz);
-- ohne diesen UNIQUE fächert der converted_card_id-LEFT-JOIN in getCardDetail auf.
create unique index cards_converted_from_item_key on cards (converted_from_item_id)
  where converted_from_item_id is not null;
create index idx_card_activity_card on card_activity (card_id, id);
create index idx_card_comments_card on card_comments (card_id, created_at);
create index idx_card_attachments_card on card_attachments (card_id);
create index idx_card_watchers_user on card_watchers (user_id);
create index idx_boards_rank on boards (rank) where archived_at is null;

-- ---------------------------------------------------------------------------
-- RLS: ENABLE (nicht FORCE — der owner-Drizzle-Pfad bleibt unberührt) + eine
-- SELECT-Policy für authenticated auf jeder Tabelle. Bewusst NUR select:
-- Realtime (Phase 3) autorisiert postgres_changes über die SELECT-Policy,
-- und es gibt keinen Browser-Supabase-Client -> alle Schreibvorgänge laufen
-- über die API (requireUser/requireAdmin) auf dem owner-Pfad. anon bekommt
-- nichts. (Der Plan nennt in §4 zusätzlich insert/update/delete-Policies für
-- authenticated; die sind für Realtime nicht nötig und würden die
-- Rank-/Activity-Invarianten der API umgehbar machen — daher weggelassen,
-- Datenintegrität geht vor.)
alter table boards               enable row level security;
alter table board_columns        enable row level security;
alter table cards                enable row level security;
alter table card_items           enable row level security;
alter table card_watchers        enable row level security;
alter table card_comments        enable row level security;
alter table card_attachments     enable row level security;
alter table card_activity        enable row level security;
alter table user_board_favorites enable row level security;

create policy authenticated_select on boards               for select to authenticated using (true);
create policy authenticated_select on board_columns        for select to authenticated using (true);
create policy authenticated_select on cards                for select to authenticated using (true);
create policy authenticated_select on card_items           for select to authenticated using (true);
create policy authenticated_select on card_watchers        for select to authenticated using (true);
create policy authenticated_select on card_comments        for select to authenticated using (true);
create policy authenticated_select on card_attachments     for select to authenticated using (true);
create policy authenticated_select on card_activity        for select to authenticated using (true);
create policy authenticated_select on user_board_favorites for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Seed: das „Channels"-Board mit seinen 8 Ausspielkanälen als Spalten. Ranks
-- aus lib/shared/rank.ts: initialRanks(1) = ['n'] (Board),
-- initialRanks(8) = ['d','g','j','m','o','r','u','x'] (Spalten). Farben =
-- Kanal-Akzente aus dem Design; Spaltennamen sind die Keys für das
-- Client-seitige Name->Icon-Mapping. Idempotent über den slug-Guard.
-- ---------------------------------------------------------------------------
insert into boards (name, slug, rank)
select 'Channels', 'channels', 'n'
where not exists (select 1 from boards where slug = 'channels');

insert into board_columns (board_id, name, color, rank)
select b.id, c.name, c.color, c.rank
from boards b
cross join (values
  ('PM/Presse',   '#2563eb', 'd'),
  ('Web',         '#0d9488', 'g'),
  ('Blog GÖ',     '#7c3aed', 'j'),
  ('Podcast',     '#c026d3', 'm'),
  ('Events',      '#ea580c', 'o'),
  ('Screens',     '#16a34a', 'r'),
  ('Science Pop', '#e11d48', 'u'),
  ('Zeitlos',     '#64748b', 'x')
) as c(name, color, rank)
where b.slug = 'channels'
  and not exists (select 1 from board_columns bc where bc.board_id = b.id);

comment on table boards is 'Redaktionsboard (BOARD_PLAN.md §4). Archiviert via archived_at, nie gelöscht.';
comment on table cards is 'Karte = Thema/Story. column_id/board_id ON DELETE RESTRICT (Spalte/Board mit Karten nicht löschbar).';
comment on table card_activity is 'Append-only Aktivitätslog (Trigger card_activity_append_only). Kein UPDATE; DELETE nur per Karten-Cascade.';
comment on table card_items is 'Checkliste + Unteraufgaben (kind checklist|subtask) in einer Tabelle.';
