-- Karten-Archiv: „archiviert" ist ein eigener Zustand neben offen/erledigt
-- (MeisterTask-Modell — abschließen ≠ archivieren). Archivierte Karten sind
-- aus dem Board raus, in der DB erhalten und wiederherstellbar. archived_at
-- NULL = aktiv, gesetzt = archiviert (Zeitpunkt).

alter table cards add column archived_at timestamptz;

-- Aktive (nicht-archivierte) Karten sind der Normalfall JEDES Board-Loads.
-- Den bisherigen Voll-Index (board_id, column_id, rank) durch die partielle
-- Variante ersetzen (WHERE archived_at IS NULL): selektiver für die aktive
-- Menge, kein Index-Ballast für die archivierte, und die Index-Zahl bleibt
-- konstant (Free-Tier, s. Memory prod-supabase-free-tier-500mb).
drop index if exists idx_cards_board_col_rank;
create index idx_cards_active on cards (board_id, column_id, rank) where archived_at is null;
