-- Board Phase 3 — Realtime aktivieren (postgres_changes).
--
-- Kontext: Der Browser abonniert Änderungen an den Kollaborations-Tabellen und
-- invalidiert daraufhin die React-Query-Caches (QK.board(slug) + QK.card(id)).
-- Autorisierung läuft über RLS: die `authenticated_select`-Policies aus
-- 20260703000002_board_core.sql sind Voraussetzung und schon vorhanden.
--
-- Diese Migration ändert NUR Publication-Mitgliedschaft + REPLICA IDENTITY —
-- keine Tabellen-/Spalten-DDL. Sie berührt daher schema.ts NICHT und taucht in
-- `check-schema-drift` nicht auf (das prüft Tabellen-/Spaltenstruktur).
--
-- REPLICA IDENTITY FULL: ohne sie trägt ein DELETE-/UPDATE-Event nur die
-- Primärschlüssel-Spalten. Für gezielte Invalidierung brauchen wir aber die
-- card_id (bei card_items/comments/attachments/activity) bzw. board_id (bei
-- cards) auch im DELETE-Payload. Die Tabellen sind klein + schreibarm, die
-- WAL-Mehrkosten von FULL sind vernachlässigbar.
--
-- Idempotent: ADD TABLE kennt kein IF NOT EXISTS, daher der Guard-DO-Block.

-- 1) REPLICA IDENTITY FULL auf allen Board-Tabellen mit Realtime-Konsum.
alter table public.cards            replica identity full;
alter table public.card_items       replica identity full;
alter table public.card_comments    replica identity full;
alter table public.card_attachments replica identity full;
alter table public.card_activity    replica identity full;

-- 2) Tabellen der supabase_realtime-Publication hinzufügen (nur falls noch nicht
--    Mitglied). board_columns/boards bewusst NICHT: sie ändern sich fast nie
--    (admin-only) und der Board-Load holt sie ohnehin frisch beim Öffnen.
do $$
declare
  t text;
  tables text[] := array[
    'cards', 'card_items', 'card_comments', 'card_attachments', 'card_activity'
  ];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
