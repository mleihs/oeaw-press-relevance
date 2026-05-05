-- Backfill leerer published_at aus bibtex/citation/ris/endnote.
--
-- Befund 2026-05-05: 595 Pubs haben published_at IS NULL (WebDB pflegt
-- pub_date manuell, oft fehlt es bei Buchkapiteln/Tagungsbeiträgen).
-- 584 davon haben das Erscheinungsjahr aber im bibtex (`year = "2010"`)
-- oder in den citation-Feldern (`(2010)`-Pattern) oder in RIS/EndNote.
--
-- Wir setzen published_at = `make_date(year, 1, 1)` — Tag/Monat sind für
-- Press-Triage nicht relevant (was zählt: "ist der von 2010 oder 2024").
-- UI sortiert standardmäßig nach published_at DESC NULLS LAST → vorher
-- erscheinen Pubs ohne Jahr ganz oben (Default-PG-NULL-Sort), nach
-- Backfill korrekt im Year-Korridor.
--
-- Wird einmal als Cleanup gerufen + von webdb-import.mjs am Ende jedes ETL-
-- Laufs (idempotent: zweiter Lauf updated 0 Zeilen).

CREATE OR REPLACE FUNCTION backfill_published_at_from_text()
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_count int;
BEGIN
  WITH extracted AS (
    SELECT
      id,
      COALESCE(
        (regexp_match(bibtex,       'year\s*=\s*[{"]([12][0-9]{3})'))[1],
        (regexp_match(citation_apa, '\(([12][0-9]{3})[a-z]?\)'))[1],
        (regexp_match(citation_de,  '\(([12][0-9]{3})\)'))[1],
        (regexp_match(citation_en,  '\(([12][0-9]{3})\)'))[1],
        (regexp_match(citation,     '\(([12][0-9]{3})\)'))[1],
        (regexp_match(ris,          'PY\s+-\s+([12][0-9]{3})'))[1],
        (regexp_match(endnote,      '%D\s+([12][0-9]{3})'))[1]
      )::int AS year_int
    FROM publications
    WHERE published_at IS NULL AND NOT archived
  )
  UPDATE publications p
  SET published_at = make_date(e.year_int, 1, 1),
      updated_at   = NOW()
  FROM extracted e
  WHERE p.id = e.id
    AND e.year_int IS NOT NULL
    AND e.year_int BETWEEN 1700 AND 2100;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION backfill_published_at_from_text IS
  'Fills publications.published_at from year-tokens in bibtex/citation/ris/endnote where published_at is NULL. Uses Jan 1 of extracted year (day/month not needed for press triage). Idempotent. Hooks into webdb-import.mjs ETL.';
