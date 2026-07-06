-- Smart-Objekte (BOARD_SMART_OBJECTS.md, Variante B): Karten referenzieren
-- n:m typisierte Objekte — Veranstaltungen, Publikationen (intern, Live-Join)
-- und externe Objekte (Provider-Registry mit Snapshot, erster Provider
-- YouTube). Herkunft (cards.source_event_id/source_publication_id) bleibt
-- unverändert die 1:1-Provenienz aus der Triage; die Referenzen hier sind die
-- vielen nachträglichen Bezüge.
--
-- Designabweichung vom ersten Planentwurf (dokumentiert im SSOT): EINE
-- card_references-Tabelle mit exactly-one-of-CHECK statt drei Link-Tabellen.
-- Gleiche FK-Integrität, aber eine globale created_at-Ordnung (die UI will
-- genau EINE vereinheitlichte Liste), ein refKey (Zeilen-id) für den
-- DELETE-Pfad und weniger Indexe (Free-Tier-Budget).

-- ---------------------------------------------------------------------------
-- external_objects — Registry externer Objekte (dedupliziert je Provider +
-- externer ID). snapshot = zuletzt gezogene Metadaten (YouTube: title,
-- channel_title, published_at, duration_seconds, view_count, thumbnail_url);
-- thumbnail_key = MinIO-Key des gespiegelten Thumbnails (null = Hotlink-
-- Fallback). refreshed_at für "Aktualisieren".
-- ---------------------------------------------------------------------------
create table external_objects (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null,
  external_id   text not null,
  url           text,
  snapshot      jsonb not null default '{}'::jsonb,
  thumbnail_key text,
  refreshed_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  constraint external_objects_provider_check check (provider = any (array['youtube'::text])),
  constraint external_objects_external_id_check check (btrim(external_id) <> ''),
  constraint external_objects_provider_external_key unique (provider, external_id)
);

-- ---------------------------------------------------------------------------
-- card_references — n:m Karte ↔ Objekt, genau EIN Ziel pro Zeile (Event ODER
-- Publikation ODER externes Objekt). Zeilen-id = refKey der API. Partielle
-- Unique-Indexe verhindern Doppel-Verknüpfung desselben Ziels an einer Karte.
-- Ziel-Cascade: verschwindet das Event/die Publikation/das Objekt, fällt die
-- Referenz mit (kein Dangling-Chip).
-- ---------------------------------------------------------------------------
create table card_references (
  id             uuid primary key default gen_random_uuid(),
  card_id        uuid not null,
  event_id       uuid,
  publication_id uuid,
  object_id      uuid,
  created_at     timestamptz not null default now(),
  created_by     uuid,
  constraint card_references_card_id_fkey foreign key (card_id)
    references cards (id) on delete cascade,
  constraint card_references_event_id_fkey foreign key (event_id)
    references events (id) on delete cascade,
  constraint card_references_publication_id_fkey foreign key (publication_id)
    references publications (id) on delete cascade,
  constraint card_references_object_id_fkey foreign key (object_id)
    references external_objects (id) on delete cascade,
  constraint card_references_created_by_fkey foreign key (created_by)
    references users (id) on delete set null,
  constraint card_references_one_target_check
    check (num_nonnulls(event_id, publication_id, object_id) = 1)
);

-- Dedup je (Karte, Ziel) — partiell, weil je Zeile nur eine Zielspalte gesetzt ist.
create unique index card_references_event_key
  on card_references (card_id, event_id) where event_id is not null;
create unique index card_references_publication_key
  on card_references (card_id, publication_id) where publication_id is not null;
create unique index card_references_object_key
  on card_references (card_id, object_id) where object_id is not null;

-- Heißer Pfad: alle Referenzen einer Karte (Modal-Load).
create index idx_card_references_card on card_references (card_id);
-- Rück-Lookups ("welche Karten bespielen dieses Event/diese Publikation?")
-- + FK-Cascade-Unterstützung bei Ziel-Deletes (Re-Importe).
create index idx_card_references_event
  on card_references (event_id) where event_id is not null;
create index idx_card_references_publication
  on card_references (publication_id) where publication_id is not null;
create index idx_card_references_object
  on card_references (object_id) where object_id is not null;

-- RLS wie alle Board-Tabellen: team-weit lesbar, Schreibpfad über Drizzle/owner.
alter table external_objects enable row level security;
alter table card_references  enable row level security;
create policy authenticated_select on external_objects for select to authenticated using (true);
create policy authenticated_select on card_references  for select to authenticated using (true);
