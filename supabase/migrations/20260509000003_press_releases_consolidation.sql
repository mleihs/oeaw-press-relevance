-- Issue 1 vom Architektur-Audit (2026-05-09): Press-Release-Daten waren in
-- zwei Tabellen verstreut (publications.press_release_* + press_release_orphans),
-- mit 8 redundanten Spalten und cross-table-Promote-Logik. Diese Migration
-- konsolidiert alles in eine `press_releases`-Tabelle mit nullable
-- publication_id-FK (NULL = orphan).
--
-- Stages:
--   A) Tabelle anlegen (mit korrektem UNIQUE-Constraint für DE+EN-Varianten)
--   B) Daten copyen aus beiden Quellen
--   C) Promote-Function umschreiben (jetzt nur noch UPDATE der FK)
--   D) Alte Spalten + Tabelle entfernen
--
-- BEGIN/COMMIT als atomic transaction — bei Fehler komplett rollback.

BEGIN;

-- ============================================================================
-- A) Neue Tabelle
-- ============================================================================

CREATE TABLE press_releases (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id       UUID REFERENCES publications(id) ON DELETE SET NULL,
  doi                  TEXT NOT NULL,
  url                  TEXT NOT NULL,
  released_at          DATE,
  lang                 TEXT
    CHECK (lang IS NULL OR lang IN ('de','en')),
  paper_title          TEXT,
  news_title           TEXT,
  source_news_uid      INT,
  -- Enrichment (für orphans + Co-Author-Pubs ohne WebDB-Substanz)
  abstract             TEXT,
  authors              TEXT[],
  journal              TEXT,
  paper_year           SMALLINT,
  keywords             TEXT[],
  openalex_id          TEXT,
  enrichment_status    TEXT
    CHECK (enrichment_status IS NULL OR enrichment_status IN ('pending','enriched','partial','failed')),
  enriched_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DOI darf einmal pro Sprache vorkommen (DE + EN-Variante derselben Studie OK).
CREATE UNIQUE INDEX uq_press_releases_doi_lang
  ON press_releases (LOWER(doi), COALESCE(lang, ''));

-- Pro publication ebenfalls 1 Press-Release pro Sprache (nullable publication_id
-- ist nicht im UNIQUE constraint — orphans dürfen beliebig viele Rows haben).
CREATE UNIQUE INDEX uq_press_releases_pub_lang
  ON press_releases (publication_id, COALESCE(lang, ''))
  WHERE publication_id IS NOT NULL;

CREATE INDEX idx_press_releases_pub
  ON press_releases (publication_id) WHERE publication_id IS NOT NULL;
CREATE INDEX idx_press_releases_orphans
  ON press_releases (released_at DESC) WHERE publication_id IS NULL;

COMMENT ON TABLE press_releases IS
  'ÖAW-Hauptseite-Pressemitteilungen, optional verknüpft mit publications via publication_id (NULL = orphan, Paper noch nicht in WebDB).';
COMMENT ON COLUMN press_releases.publication_id IS
  'NULL = orphan (Co-Author-only paper, noch nicht via WebDB importiert). Wird automatisch in webdb-import.mjs durch promote_press_release_orphans() befüllt sobald Paper importiert.';

-- ============================================================================
-- B) Daten copyen
-- ============================================================================

-- B1) Matched: aus publications.press_release_*
INSERT INTO press_releases (publication_id, doi, url, released_at, lang, paper_title)
SELECT
  p.id,
  LOWER(p.doi),
  p.press_release_url,
  p.press_release_at,
  p.press_release_lang,
  p.press_release_title
FROM publications p
WHERE p.press_release_url IS NOT NULL;

-- B2) Orphans: aus press_release_orphans (incl. enrichment-data)
INSERT INTO press_releases (
  doi, url, released_at, lang, paper_title, news_title, source_news_uid,
  abstract, authors, journal, paper_year, keywords, openalex_id,
  enrichment_status, enriched_at, created_at
)
SELECT
  LOWER(o.doi),
  o.press_release_url,
  o.press_release_at,
  o.press_release_lang,
  o.paper_title,
  o.news_title,
  o.source_news_uid,
  o.abstract,
  o.authors,
  o.journal,
  o.paper_year,
  o.keywords,
  o.openalex_id,
  o.enrichment_status,
  o.enriched_at,
  o.created_at
FROM press_release_orphans o;

-- ============================================================================
-- C) Promote-Function umschreiben — jetzt ist es nur noch UPDATE der FK
-- ============================================================================

CREATE OR REPLACE FUNCTION promote_press_release_orphans()
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  n int;
BEGIN
  -- Verlinkt orphan-Rows (publication_id IS NULL) zu publications wenn DOI
  -- jetzt matched. Idempotent: setzt nichts wenn pub schon eine PR in
  -- derselben Sprache hat (uq_press_releases_pub_lang verhindert Duplikate).
  UPDATE press_releases pr
  SET publication_id = p.id
  FROM publications p
  WHERE pr.publication_id IS NULL
    AND LOWER(pr.doi) = LOWER(p.doi)
    AND p.doi IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM press_releases pr2
      WHERE pr2.publication_id = p.id
        AND COALESCE(pr2.lang, '') = COALESCE(pr.lang, '')
    );

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

COMMENT ON FUNCTION promote_press_release_orphans IS
  'Verlinkt orphan-press_releases (publication_id IS NULL) zu publications, sobald DOI matched. Aufruf nach jedem WebDB-Import (siehe scripts/webdb-import.mjs). Idempotent. Returns count of promoted rows.';

-- ============================================================================
-- D) Alte Spalten + Tabelle entfernen
-- ============================================================================

DROP INDEX IF EXISTS idx_publications_press_release;

ALTER TABLE publications
  DROP COLUMN press_release_url,
  DROP COLUMN press_release_at,
  DROP COLUMN press_release_lang,
  DROP COLUMN press_release_title;

DROP TABLE press_release_orphans;

COMMIT;
