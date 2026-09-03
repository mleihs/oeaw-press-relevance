-- Perf-Audit #4 (Rest) + #8: fehlende Indexe für die Publikations-Suche und
-- den Scoring-Status.
--
-- (1) Suche: lib/server/publications/list.ts sucht per OR über 5 ILIKEs
--     (title, original_title, summary_de, summary_en, lead_author).
--     Trigram-Indexe existieren bereits für title (20260427000001),
--     original_title und lead_author (20260429000001 — deren Kommentar
--     behauptete auch summary_de, angelegt wurde es nie). Hier kommen die
--     zwei fehlenden Zweige dazu: summary_de und summary_en.
--
--     PARTIELL auf archived = false: die Suche filtert (außer bei explizitem
--     includeArchived) immer auf archived = false — dasselbe Prädikat, das
--     auch press_eligible_publications als erste Klausel trägt. Der Planner
--     kann das Index-Prädikat damit für jeden BitmapOr-Zweig beweisen.
--     Bewusst KEIN "IS NOT NULL AND <> ''" im Prädikat (anders als
--     20260429000001): ein "<> ''"-Prädikat kann der Planner aus einem
--     ILIKE-Zweig NICHT ableiten. Weil ein OR nur dann per BitmapOr läuft,
--     wenn JEDER Zweig einen nutzbaren Index hat, machten die zwei alten
--     "<> ''"-Partial-Indexe die gesamte 5-Wege-Suche zum Seq-Scan — die
--     Indexe aus 20260429000001 waren für ihre Zielquery totes Gewicht.
--     Deshalb hier zusätzlich: original_title- und lead_author-Index auf
--     dasselbe archived-Prädikat umgebaut.
--
--     Lokal verifiziert (EXPLAIN ANALYZE, 5-Wege-ILIKE): vorher Seq Scan
--     ~200 ms, nachher BitmapOr über alle 5 trgm-Indexe ~9 ms.
--
--     Größenabschätzung (lokal gemessen, Stand 2026-08-31, prod-naher
--     Bestand 39.164 Pubs / 37.506 aktiv): nur 4.813 aktive Pubs haben
--     Summaries (⌀ ~1,15 KB pro Sprache) → ~8,7 MB pro Summary-Index,
--     ~17 MB für beide; die zwei Umbauten bleiben nahe ihrer alten Größe
--     (original_title ~11 MB, lead_author ~2,5 MB). Netto ~ +18 MB gegen
--     das 500-MB-Supabase-Limit (aktuell ~391 MB) — vertretbar; der
--     Partial-Filter spart die 1.658 archivierten Pubs und hält die Indexe
--     beim künftigen Archivieren automatisch schlank.
--
-- (2) Scoring-Status liest max(updated_at) über publications — ohne Index
--     ein Full-Scan pro Aufruf. B-Tree auf updated_at DESC macht daraus
--     einen Index-Only-/Backward-Scan (~1 MB bei 39k Zeilen). Nicht
--     partiell: max() soll den Gesamtbestand sehen.

CREATE INDEX IF NOT EXISTS idx_pub_summary_de_trgm
  ON publications USING gin (summary_de gin_trgm_ops)
  WHERE archived = false;

CREATE INDEX IF NOT EXISTS idx_pub_summary_en_trgm
  ON publications USING gin (summary_en gin_trgm_ops)
  WHERE archived = false;

-- Umbau der zwei 20260429000001-Indexe: gleiches Prädikat wie oben, damit
-- der BitmapOr über alle 5 Suchzweige beweisbar wird (Begründung im Kopf).
DROP INDEX IF EXISTS idx_pub_original_title_trgm;
CREATE INDEX idx_pub_original_title_trgm
  ON publications USING gin (original_title gin_trgm_ops)
  WHERE archived = false;

DROP INDEX IF EXISTS idx_pub_lead_author_trgm;
CREATE INDEX idx_pub_lead_author_trgm
  ON publications USING gin (lead_author gin_trgm_ops)
  WHERE archived = false;

CREATE INDEX IF NOT EXISTS idx_pub_updated_at
  ON publications (updated_at DESC);
