-- Materialized view: publication ↔ ÖSTAT6 mapping (resolved via authoring persons).
-- The unique index (publication_id, oestat6_id) is required for REFRESH MATERIALIZED VIEW CONCURRENTLY,
-- which is run at the end of scripts/webdb-import.mjs after each ETL.

CREATE MATERIALIZED VIEW publication_oestat6 AS
SELECT DISTINCT pp.publication_id, po.oestat6_id
FROM person_publications pp
JOIN person_oestat6 po ON pp.person_id = po.person_id;

CREATE UNIQUE INDEX uq_publication_oestat6
  ON publication_oestat6 (publication_id, oestat6_id);

CREATE INDEX idx_publication_oestat6_oestat6
  ON publication_oestat6 (oestat6_id);

CREATE INDEX idx_publication_oestat6_pub
  ON publication_oestat6 (publication_id);
