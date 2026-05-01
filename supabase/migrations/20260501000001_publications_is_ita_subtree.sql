-- publications.is_ita_subtree — cached boolean flag for the ITA-subtree
-- filter. Set to true if the publication belongs (via orgunit_publications)
-- to any orgunit whose akronym begins with "ITA" — i.e. ITA root, ITA_AG_*,
-- ITA_Allgemein. Computed once on import (see scripts/webdb-import.mjs)
-- and read on every /api/publications request when ?exclude_ita=true.
--
-- Why a column instead of a join: the API currently materializes the ITA-pub
-- ID set in JavaScript (~365 IDs) and then asks PostgREST for "id NOT IN
-- (...)". That URL exceeds PostgREST's ~8 KB cap, so the request fails with
-- "URI too long". Splitting into chunks doesn't help because all the chunks
-- still go in the same URL. The previous heuristic ("ITA Dossier" in title /
-- url contains oeaw.ac.at/ita / journal starts with "ITA-") missed reports
-- that don't carry one of those literal markers (e.g. an ITA AI report
-- titled "Künstliche Intelligenz. Verstehbarkeit und Transparenz").
--
-- A boolean column eliminates both problems: one indexed predicate, full
-- semantic correctness, no client-side filter race.

ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS is_ita_subtree boolean NOT NULL DEFAULT false;

-- Partial index — most queries that care about this column want
-- is_ita_subtree=false (Top-10, dashboard, researchers excl. ITA).
CREATE INDEX IF NOT EXISTS idx_pubs_not_ita_subtree
  ON publications (is_ita_subtree)
  WHERE is_ita_subtree = false;

-- Initial backfill. Idempotent — re-running flips back any pubs whose
-- orgunit assignment changed since the last call.
WITH ita_pubs AS (
  SELECT DISTINCT op.publication_id AS pid
  FROM orgunit_publications op
  JOIN orgunits o ON o.id = op.orgunit_id
  WHERE o.akronym_de ILIKE 'ITA%'
)
UPDATE publications p
SET is_ita_subtree = (p.id IN (SELECT pid FROM ita_pubs))
WHERE p.is_ita_subtree IS DISTINCT FROM (p.id IN (SELECT pid FROM ita_pubs));

COMMENT ON COLUMN publications.is_ita_subtree IS
  'Cached: true iff publication has an orgunit_publications row pointing at an ITA-prefixed akronym. Refreshed by scripts/webdb-import.mjs.';
