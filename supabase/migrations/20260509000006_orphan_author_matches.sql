-- Orphan-row-Anreicherung um OeAW-Person-Matches.
--
-- Background: 22 von 28 orphans haben mindestens einen lastname-match in
-- der persons-Tabelle (siehe deep-dive 2026-05-09). Reines lastname-Matching
-- wirft viele False-Positives bei Common-Names ("Fischer", "Schmid", "Wang").
-- Diese Migration fügt:
--   1. `oeaw_author_matches` JSONB-Spalte (nur für orphans gefüllt)
--   2. `compute_oeaw_author_matches()` PG-Function mit robusterem Matching:
--      - exact lastname (case-insensitive)
--      - PLUS firstname-erste-letter-match (filtert ~80% der Falschen)
--   3. Initial-Backfill für die existing 28 Orphans
--
-- UI nutzt das Feld als „OeAW-Verbindung: Walter Pohl, Patrick Geary"-Hint
-- → Press-Team weiß sofort welche ÖAW-Person als Source/Kontakt anrufbar ist.

ALTER TABLE press_releases
  ADD COLUMN IF NOT EXISTS oeaw_author_matches JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN press_releases.oeaw_author_matches IS
  'Array of OeAW-person-Matches gegen authors[]. Lastname-exact + firstname-initial-Match. Entries: {person_id, name, matched_author}. Nur für orphans (publication_id IS NULL) berechnet — matched-Pubs haben person_publications.';

-- Pure function (STABLE = identical input → identical output, no side effects)
CREATE OR REPLACE FUNCTION compute_oeaw_author_matches(p_authors text[])
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  seen_ids uuid[] := ARRAY[]::uuid[];
  author text;
  author_lastname text;
  author_first_initial text;
  rec record;
BEGIN
  IF p_authors IS NULL OR cardinality(p_authors) = 0 THEN
    RETURN result;
  END IF;

  FOREACH author IN ARRAY p_authors LOOP
    -- Lastname = last whitespace-separated token. Hyphens preserved
    -- ("Stocker-Waldhuber" stays intact; "De la Concepción" matches
    -- "Concepción" only — false-negative for compound surnames, acceptable).
    author_lastname := REGEXP_REPLACE(author, '^.*\s', '');
    -- First-initial = first character of first token (handles "P. J. Geary",
    -- "Patrick J. Geary", "Patrick Geary" — all start with "P").
    author_first_initial := LEFT(author, 1);

    IF author_lastname = '' OR author_first_initial = '' THEN CONTINUE; END IF;

    FOR rec IN
      SELECT p.id, p.firstname, p.lastname
      FROM persons p
      WHERE p.lastname IS NOT NULL
        AND p.firstname IS NOT NULL
        AND LOWER(p.lastname) = LOWER(author_lastname)
        AND LEFT(LOWER(p.firstname), 1) = LOWER(author_first_initial)
    LOOP
      -- Dedupe per person across multiple author-strings
      IF NOT (rec.id = ANY(seen_ids)) THEN
        seen_ids := seen_ids || rec.id;
        result := result || jsonb_build_array(jsonb_build_object(
          'person_id', rec.id,
          'name', rec.firstname || ' ' || rec.lastname,
          'matched_author', author
        ));
      END IF;
    END LOOP;
  END LOOP;

  RETURN result;
END $$;

COMMENT ON FUNCTION compute_oeaw_author_matches IS
  'Match author-strings (z.B. "Sabine B. Rumpf") gegen persons-Tabelle via lastname-exact + firstname-erste-letter. Returns deduped JSONB array. Pure (STABLE) — call from script after authors-update or as default-value-trigger.';

-- Backfill für existing orphans
UPDATE press_releases
SET oeaw_author_matches = compute_oeaw_author_matches(authors)
WHERE publication_id IS NULL AND authors IS NOT NULL;
