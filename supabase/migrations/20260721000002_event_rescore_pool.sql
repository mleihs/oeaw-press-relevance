-- Event-Re-Score-Pool: das Gegenstück zu publication_rescore_pool
-- (20260721000001) auf der Events-Seite.
--
-- Motivation (Review der AP1-AP6-Umsetzung, 2026-07-21): AP1 hat auf der
-- Publikations-Seite gelernt, dass ein Force-Pfad, der sein Prädikat selbst
-- formuliert, unweigerlich hinter der Kandidaten-View zurückbleibt. Der
-- Events-Force-Pfad in lib/server/events/analyze.ts tat aber genau das: er
-- schrieb `event_at >= NOW()` im TypeScript nach, statt eine View zu lesen.
-- Heute ist das exakt äquivalent zu event_scoring_candidates minus der
-- Score-Bedingung — aber sobald die Kandidaten-View eine Bedingung bekommt
-- (abgesagte Events, ausgeschlossene Ordner), umgeht der Force-Pfad sie still.
-- Das ist dieselbe Bug-Klasse, die AP1 bei den Publikationen geschlossen hat.
--
--   event_rescore_pool        = „darf überhaupt bewertet werden" (künftige Events)
--   event_scoring_candidates  = Pool + „ist noch offen" (event_score IS NULL)
--
-- SEMANTIKERHALTEND: die Zeilen- und Spaltenmenge von
-- event_scoring_candidates ist vor und nach dieser Migration identisch
-- (Prädikat nur umgruppiert, nicht geändert).
--
-- DROP + CREATE statt CREATE OR REPLACE, mit Absicht: `SELECT *` friert die
-- Spaltenliste beim Anlegen ein, und CREATE OR REPLACE VIEW verlangt exakt
-- dieselbe Spaltenzahl wie die bestehende View. event_scoring_candidates
-- stammt vom 2026-07-16; hat `events` seither eine Spalte bekommen, hätte ein
-- REPLACE mit „cannot change number of columns in view" abgebrochen. Ein
-- DROP+CREATE ist von dieser Drift unabhängig und läuft innerhalb der
-- Migrations-Transaktion, ist also für Leser nie sichtbar leer. Auf die Views
-- baut nichts weiter auf (nur Anwendungscode liest sie), deshalb kein CASCADE.
--
-- ROLLBACK:
--   DROP VIEW IF EXISTS event_scoring_candidates;
--   DROP VIEW IF EXISTS event_rescore_pool;
--   CREATE VIEW event_scoring_candidates AS
--     SELECT * FROM events e
--     WHERE e.event_at >= now() AND e.event_score IS NULL;

DROP VIEW IF EXISTS event_scoring_candidates;
DROP VIEW IF EXISTS event_rescore_pool;

-- ---------------------------------------------------------------------------
-- 1. Pool: bewertbar, unabhängig davon ob schon bewertet
-- ---------------------------------------------------------------------------
-- Wortlaut aus 20260716000001_scoring_candidate_views.sql übernommen, MINUS
-- `event_score IS NULL`. Vergangene Events werden nie wieder Kandidaten; das
-- ist der einzige Bewertbarkeitstest, den Events kennen (anders als
-- Publikationen brauchen sie kein Content-Gate — der Titel plus die
-- Beschreibung des Veranstaltungseintrags sind immer da).
CREATE VIEW event_rescore_pool AS
  SELECT *
  FROM events e
  WHERE e.event_at >= now();

COMMENT ON VIEW event_rescore_pool IS
  'DIE Menge grundsätzlich bewertbarer Events (künftige, event_at >= now) — OHNE die Offen-Bedingung. Basis von event_scoring_candidates und Gate des forceReanalyze-Pfades in lib/server/events/analyze.ts. Gegenstück zu publication_rescore_pool.';

-- ---------------------------------------------------------------------------
-- 2. Kandidaten = Pool + noch offen (Zeilenmenge unverändert)
-- ---------------------------------------------------------------------------
-- event_score IS NULL statt analysis_status='pending' fängt auch failed-Retries
-- mit ab und spiegelt den Re-Score-Reset in lib/server/events/sync.ts
-- upsertEvents. Wortgleich zu 20260716000001.
CREATE VIEW event_scoring_candidates AS
  SELECT *
  FROM event_rescore_pool e
  WHERE e.event_score IS NULL;

COMMENT ON VIEW event_scoring_candidates IS
  'DIE kanonische Menge bewertbarer Events (Relevanz-Scoring) = event_rescore_pool + event_score IS NULL. Spiegelt scripts/event-candidates.mjs und den Re-Score-Reset in lib/server/events/sync.ts upsertEvents. Konsumiert von lib/server/events/analyze.ts, lib/server/ingest/status.ts.';
