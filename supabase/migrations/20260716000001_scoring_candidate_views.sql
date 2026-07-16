-- Kanonische Kandidaten-Views fürs Relevanz-Scoring (Publikationen + Events).
--
-- Motivation (Memory-Lektion „Zählungen immer auf die View", vgl.
-- press_eligible_publications): der In-Chat-Scoring-Pfad (scripts/session-
-- pipeline.mjs, scripts/event-candidates.mjs) trug bisher das STRENGE
-- Kandidaten-Prädikat, während die serverseitigen OpenRouter-Batch-Pfade
-- (lib/server/analysis/batch.ts, lib/server/events/analyze.ts) ein LOCKERERES
-- Prädikat hatten (kein 120-Zeichen-Content-Gate, kein `press_score IS NULL`,
-- kein ITA-Ausschluss). Der neue „Bewerten"-Fallback-Button ruft die Batch-
-- Pfade → beide Welten müssen dasselbe zählen und dieselben Zeilen liefern.
-- Diese Views sind ab jetzt DIE eine Wahrheit; alle Konsumenten komponieren
-- darüber statt das Prädikat neu zu buchstabieren.
--
-- Additiv (nur CREATE OR REPLACE VIEW) → Rollback = DROP VIEW.

-- ---------------------------------------------------------------------------
-- 1. Publikationen: bewertbare Kandidaten
-- ---------------------------------------------------------------------------
-- Spiegelt den In-Chat-Filter aus scripts/session-pipeline.mjs cmdCandidates
-- (MIN_CONTENT_LEN=120), mit ZWEI bewussten Präzisierungen:
--   * ITA-Ausschluss über die gepflegte, indizierte Spalte is_ita_subtree
--     statt des rekursiven ita_tree-CTE (identische Semantik, ein Index-Scan).
--   * analysis_status IN ('pending','failed') statt nur 'pending': ein zuvor
--     fehlgeschlagener LLM-Lauf (failed) darf zurück in den Pool (Retry). Der
--     harte `press_score IS NULL`-Guard verhindert dabei jedes Doppel-Scoring.
-- enrichment_status='failed' bleibt bewusst drin: eine Pub ohne DOI durchläuft
-- die API-Cascade erfolglos (→ failed), kann aber echte WebDB-summaries tragen.
-- Das Content-Gate GREATEST(...) >= 120 ist der eigentliche Bewertbarkeitstest.
CREATE OR REPLACE VIEW publication_scoring_candidates AS
  SELECT *
  FROM publications p
  WHERE p.archived = false
    AND p.analysis_status IN ('pending', 'failed')
    AND p.press_score IS NULL
    AND p.enrichment_status IN ('enriched', 'partial', 'failed')
    AND p.is_ita_subtree = false
    AND GREATEST(
      length(COALESCE(p.summary_de, '')),
      length(COALESCE(p.summary_en, '')),
      length(COALESCE(p.enriched_abstract, '')),
      length(COALESCE(p.abstract, ''))
    ) >= 120;

COMMENT ON VIEW publication_scoring_candidates IS
  'DIE kanonische Menge bewertbarer Publikationen (Relevanz-Scoring). Spiegelt den In-Chat-Filter aus scripts/session-pipeline.mjs (Content-Gate >= 120 Zeichen), ITA-Ausschluss via is_ita_subtree, plus failed-Retry (press_score IS NULL schützt vor Doppel-Scoring). Konsumiert von lib/server/analysis/batch.ts, lib/server/ingest/status.ts, scripts/session-pipeline.mjs, scripts/import-*-scoring.';

-- ---------------------------------------------------------------------------
-- 2. Events: bewertbare Kandidaten
-- ---------------------------------------------------------------------------
-- Spiegelt scripts/event-candidates.mjs (zukünftige, noch nicht bewertete
-- Events) und den Re-Score-Reset in upsertEvents (event_score→NULL bei
-- materieller Inhaltsänderung eines künftigen Events). event_score IS NULL
-- statt analysis_status='pending' fängt damit auch failed-Retries mit ab.
CREATE OR REPLACE VIEW event_scoring_candidates AS
  SELECT *
  FROM events e
  WHERE e.event_at >= now()
    AND e.event_score IS NULL;

COMMENT ON VIEW event_scoring_candidates IS
  'DIE kanonische Menge bewertbarer Events (Relevanz-Scoring): künftige Events (event_at >= now) ohne event_score. Spiegelt scripts/event-candidates.mjs und den Re-Score-Reset in lib/server/events/sync.ts upsertEvents. Konsumiert von lib/server/events/analyze.ts, lib/server/ingest/status.ts.';
