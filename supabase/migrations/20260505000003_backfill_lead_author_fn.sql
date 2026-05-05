-- Backfill leerer lead_author aus person_publications-Junction.
--
-- Befund 2026-05-05: ~1162 von ~1525 Pubs mit leerem lead_author haben
-- Autor:innen via person_publications-Junction (kanonische Autorenrelation).
-- WebDB pflegt das skalare lead_author-Feld manuell, oft fehlt es aber bei
-- Buchkapiteln/Tagungsbeiträgen. UI-displayAuthor() schaut nur dorthin und
-- zeigt fälschlich "Unbekannt".
--
-- Diese Funktion füllt lead_author aus dem Eintrag mit MIN(sorting) je Pub.
-- Idempotent: zweiter Lauf updated 0 Zeilen, weil danach lead_author NICHT
-- mehr leer ist.
--
-- Wird einmal als Cleanup gerufen + von webdb-import.mjs am Ende jedes ETL-
-- Laufs (nach importPersonPublications), damit neue Pubs gleich konsistent
-- importiert werden.

CREATE OR REPLACE FUNCTION backfill_lead_author_from_persons()
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_count int;
BEGIN
  -- Konservative Variante: NUR füllen wenn lead_author leer.
  -- Eine frühere Variante hat zusätzlich „lastname-only"-Werte überschrieben
  -- — was bei Duplikat-Pubs (mehrere webdb_uid pro Paper, je verschiedene
  -- Junction-Person verlinkt) die falsche Person rein gemacht hat.
  -- Lastname-Vervollständigung gehört in eine getrennte, vorsichtigere
  -- Function (z.B. nur wenn Junction-lastname == lead_author).
  WITH primary_authors AS (
    SELECT DISTINCT ON (pp.publication_id)
      pp.publication_id,
      NULLIF(TRIM(COALESCE(p.firstname, '') || ' ' || COALESCE(p.lastname, '')), '') AS name
    FROM person_publications pp
    JOIN persons p ON p.id = pp.person_id
    ORDER BY pp.publication_id, pp.sorting NULLS LAST, p.lastname NULLS LAST
  )
  UPDATE publications pub
  SET lead_author = pa.name,
      updated_at  = NOW()
  FROM primary_authors pa
  WHERE pub.id = pa.publication_id
    AND (pub.lead_author IS NULL OR pub.lead_author = '')
    AND pa.name IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION backfill_lead_author_from_persons IS
  'Fills publications.lead_author from person_publications JOIN where empty. Idempotent. Called by ETL post-import + as one-shot on 2026-05-05 (1162 rows fixed).';
