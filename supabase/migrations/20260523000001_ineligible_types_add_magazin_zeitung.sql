-- Add publication type 3 ("Beitrag in Magazin/Zeitung") to the canonical
-- ineligible-types view so newspaper / magazine articles never reach the
-- press-pitch eligibility relation (press_eligible_publications).
--
-- Today every type-3 row also carries popular_science=true, which already
-- excludes it via the popular_science=false clause in press_eligible_
-- publications. This migration adds belt-and-suspenders type-based
-- exclusion: the eligibility predicate then no longer depends on a single
-- per-row flag being set correctly by the WebDB import pipeline.
--
-- Mirror: lib/shared/eligibility.ts ELIGIBILITY_EXCLUDE_TYPE_UIDS lists
-- the same UID set. Parity pinned by scripts/smoke/eligibility.ts.

CREATE OR REPLACE VIEW ineligible_publication_types AS
  SELECT id, webdb_uid
  FROM publication_types
  -- Mirror of ELIGIBILITY_EXCLUDE_TYPE_UIDS (lib/shared/eligibility.ts):
  -- 3 Beitrag in Magazin/Zeitung · 5 Rezension · 7 Diplomarbeit ·
  -- 8 Dissertation · 13 Habilitation · 15 Konferenz-Poster ·
  -- 19 Skriptum · 23 Lexikon-Stub.
  WHERE webdb_uid = ANY (ARRAY[3, 5, 7, 8, 13, 15, 19, 23]);

COMMENT ON VIEW ineligible_publication_types IS
  'Canonical PG resolution of press-ineligible publication_types. UID list mirrors lib/shared/eligibility.ts (the browser filter UI needs a TS copy); parity pinned by scripts/smoke/eligibility.ts.';
