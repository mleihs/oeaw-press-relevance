-- Re-Score-Pool: das Basis-Prädikat der Bewertbarkeit, ohne die „noch offen"-Bedingungen.
--
-- Motivation (Befund docs/RESUME_SCORING_SPLIT_REVIEW.md, 2026-07-21): der
-- Force-Pfad in lib/server/analysis/batch.ts hatte GAR KEIN WHERE
-- (`where: undefined`) und konnte damit archivierte, ITA- und inhaltsleere
-- Publikationen bewerten — also genau das, was publication_scoring_candidates
-- ausschließt. Statt das Prädikat im TypeScript ein zweites Mal zu
-- buchstabieren (die Lektion aus 20260716000001), bekommt es hier eine eigene
-- View, und die Kandidaten-View komponiert darüber:
--
--   publication_rescore_pool          = „darf überhaupt bewertet werden"
--   publication_scoring_candidates    = Pool + „ist noch offen"
--                                       (analysis_status pending/failed,
--                                        press_score IS NULL)
--
-- SEMANTIKERHALTEND: die Zeilen- und Spaltenmenge von
-- publication_scoring_candidates ist vor und nach dieser Migration identisch
-- (Prädikat nur umgruppiert, nicht geändert) — geprüft per Count-Vergleich auf
-- Prod vor dem Apply.
--
-- Additiv (CREATE VIEW / CREATE OR REPLACE VIEW).
-- ROLLBACK:
--   CREATE OR REPLACE VIEW publication_scoring_candidates AS
--     SELECT * FROM publications p
--     WHERE p.archived = false AND p.analysis_status IN ('pending','failed')
--       AND p.press_score IS NULL
--       AND p.enrichment_status IN ('enriched','partial','failed')
--       AND p.is_ita_subtree = false
--       AND GREATEST(length(COALESCE(p.summary_de,'')), length(COALESCE(p.summary_en,'')),
--                    length(COALESCE(p.enriched_abstract,'')), length(COALESCE(p.abstract,''))) >= 120;
--   DROP VIEW publication_rescore_pool;

-- ---------------------------------------------------------------------------
-- 1. Pool: bewertbar, unabhängig davon ob schon bewertet
-- ---------------------------------------------------------------------------
-- Wortlaut aus 20260716000001_scoring_candidate_views.sql übernommen, MINUS
-- `analysis_status IN ('pending','failed')` und `press_score IS NULL`. Das
-- Content-Gate GREATEST(...) >= 120 bleibt der eigentliche Bewertbarkeitstest,
-- der ITA-Ausschluss läuft weiter über die indizierte Spalte is_ita_subtree.
CREATE OR REPLACE VIEW publication_rescore_pool AS
  SELECT *
  FROM publications p
  WHERE p.archived = false
    AND p.enrichment_status IN ('enriched', 'partial', 'failed')
    AND p.is_ita_subtree = false
    AND GREATEST(
      length(COALESCE(p.summary_de, '')),
      length(COALESCE(p.summary_en, '')),
      length(COALESCE(p.enriched_abstract, '')),
      length(COALESCE(p.abstract, ''))
    ) >= 120;

COMMENT ON VIEW publication_rescore_pool IS
  'DIE Menge grundsätzlich bewertbarer Publikationen (Content-Gate >= 120 Zeichen, nicht archiviert, nicht ITA, Enrichment durchlaufen) — OHNE die Offen-Bedingung. Basis von publication_scoring_candidates und Gate des forceReanalyze-Pfades in lib/server/analysis/batch.ts: eine Neubewertung darf alles Bewertbare treffen, aber niemals Archiviertes/ITA/Inhaltsloses.';

-- ---------------------------------------------------------------------------
-- 2. Kandidaten = Pool + noch offen (Zeilenmenge unverändert)
-- ---------------------------------------------------------------------------
-- analysis_status IN ('pending','failed') lässt fehlgeschlagene LLM-Läufe zurück
-- in den Pool (Retry); der harte press_score IS NULL-Guard verhindert dabei
-- jedes Doppel-Scoring. Beides wortgleich zu 20260716000001.
CREATE OR REPLACE VIEW publication_scoring_candidates AS
  SELECT *
  FROM publication_rescore_pool p
  WHERE p.analysis_status IN ('pending', 'failed')
    AND p.press_score IS NULL;

COMMENT ON VIEW publication_scoring_candidates IS
  'DIE kanonische Menge bewertbarer, noch OFFENER Publikationen (Relevanz-Scoring) = publication_rescore_pool + analysis_status IN (pending,failed) + press_score IS NULL. Spiegelt den In-Chat-Filter aus scripts/session-pipeline.mjs (Content-Gate >= 120 Zeichen). Konsumiert von lib/server/analysis/batch.ts, lib/server/ingest/status.ts, scripts/session-pipeline.mjs, scripts/import-*-scoring. Achtung: der Web-Knopf schneidet zusätzlich auf created_at >= now() - SCORING_RECENT_DAYS (lib/shared/dashboard.ts); der Altbestand bleibt dem In-Chat-Pfad vorbehalten.';
