-- Orphan press_release embeddings — closes the gap where the press-cluster
-- k-NN reference set was missing pubs that we pressed but don't have in the
-- WebDB (~20% of all press_releases, e.g. international co-authorships
-- without an ÖAW-lead-paper-record).
--
-- These rows already carry CrossRef/OpenAlex-enriched title + abstract on
-- press_releases itself; the existing embedding pipeline just ignored them
-- because it only iterated over `publications`. This migration adds a
-- symmetric `press_release_embeddings` table for the orphan subset and
-- introduces `press_cluster_view` as the SINGLE source-of-truth for what's
-- in the press cluster — every refresh / lookup function reads from the
-- view instead of duplicating the UNION ALL.
--
-- Design — Option A (separate table) over Option B (shadow-pubs in
-- publications) because:
--   1. Zero schema-pollution in `publications` — orphans aren't real WebDB
--      publications and shouldn't appear in publication views, decision
--      flows, MeisterTask pushes etc.
--   2. ON DELETE CASCADE on press_releases keeps lifecycle local.
--   3. A single VIEW factors the UNION across all consumers — adding a
--      future embedding source (lecture_embeddings etc.) means one view
--      edit, not three function rewrites.

-- ---------------------------------------------------------------------------
-- 1) per-orphan-press-release embedding
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS press_release_embeddings (
  press_release_id UUID PRIMARY KEY REFERENCES press_releases(id) ON DELETE CASCADE,
  model            TEXT NOT NULL,
  embedding        vector(768) NOT NULL,
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_text_hash TEXT,
  CONSTRAINT press_release_embeddings_model_chk CHECK (model <> '')
);

COMMENT ON TABLE press_release_embeddings IS
  'SPECTER2 embedding for orphan press_releases (publication_id IS NULL) — '
  'ÖAW-pressed papers without a matching WebDB publication row. Symmetric '
  'to publication_embeddings; populated by the same compute-embeddings.py '
  'orphan-pass. Joined into press_cluster_view alongside publication_embeddings '
  'so all downstream consumers (centroid, k-NN scoring, similar-pressed RPC) '
  'see a single unified cluster.';

COMMENT ON COLUMN press_release_embeddings.model IS
  'Embedding model identifier — must match publication_embeddings.model for the press_cluster_view UNION to be semantically valid.';
COMMENT ON COLUMN press_release_embeddings.source_text_hash IS
  'sha256 of paper_title+abstract used to compute the embedding. Skips unchanged orphans on recompute.';

CREATE INDEX IF NOT EXISTS press_release_embeddings_model_idx
  ON press_release_embeddings (model);

-- No IVFFlat index — only ~28 rows currently, sequential scan is faster than
-- IVFFlat overhead. If this grows past ~500 orphans, revisit.

-- ---------------------------------------------------------------------------
-- 2) Lifecycle trigger: drop orphan-embedding when promoted to matched
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_press_releases_promote_drop_orphan_embedding()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.publication_id IS NULL AND NEW.publication_id IS NOT NULL THEN
    DELETE FROM press_release_embeddings WHERE press_release_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS press_releases_promote_drop_orphan_embedding ON press_releases;
CREATE TRIGGER press_releases_promote_drop_orphan_embedding
  AFTER UPDATE OF publication_id ON press_releases
  FOR EACH ROW
  EXECUTE FUNCTION trg_press_releases_promote_drop_orphan_embedding();

COMMENT ON TRIGGER press_releases_promote_drop_orphan_embedding ON press_releases IS
  'When an orphan press_release is promoted to matched (publication_id NULL→NOT NULL), drop its press_release_embedding row — the matched publication has its own embedding now via publication_embeddings.';

-- ---------------------------------------------------------------------------
-- 3) press_cluster_view — single source of truth for "what's in the cluster"
--    All similarity/centroid/lookup functions read from this view. Adding a
--    future embedding source = adding one UNION ALL leg here; downstream
--    functions stay untouched.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW press_cluster_view AS
  -- Matched: pubs with a publication_embedding AND a press_release
  SELECT
    pe.embedding,
    pe.model,
    'publication'::TEXT AS kind,
    pe.publication_id   AS publication_id,
    pe.publication_id   AS exclude_pub_id,   -- self-exclusion key for k-NN
    pr.id               AS press_release_id,
    p.title             AS title,
    pr.released_at      AS released_at,
    pr.url              AS press_url
  FROM publication_embeddings pe
  JOIN press_releases pr ON pr.publication_id = pe.publication_id
  JOIN publications   p  ON p.id = pe.publication_id

  UNION ALL

  -- Orphans: press_release_embeddings whose press_release has no matching pub
  SELECT
    pre.embedding,
    pre.model,
    'orphan'::TEXT AS kind,
    NULL::UUID     AS publication_id,
    NULL::UUID     AS exclude_pub_id,         -- orphans can't collide with any pub
    pre.press_release_id,
    COALESCE(NULLIF(pr.paper_title, ''), NULLIF(pr.news_title, ''), '(ohne Titel)') AS title,
    pr.released_at,
    pr.url AS press_url
  FROM press_release_embeddings pre
  JOIN press_releases pr ON pr.id = pre.press_release_id
  WHERE pr.publication_id IS NULL;

COMMENT ON VIEW press_cluster_view IS
  'Unified press-cluster: matched publication_embeddings + orphan press_release_embeddings. Every downstream function (refresh_press_cluster_centroid, refresh_press_similarity_knn, similar_pressed_pubs) reads exclusively from this view — adding a new embedding source is a one-line UNION-ALL leg here, not 3 function rewrites.';

-- ---------------------------------------------------------------------------
-- 4) refresh_press_cluster_centroid — just AVG over the view
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_press_cluster_centroid(p_model TEXT)
RETURNS TABLE(out_model TEXT, n_samples INTEGER, computed_at TIMESTAMPTZ)
LANGUAGE plpgsql
AS $$
DECLARE
  v_centroid vector(768);
  v_n INTEGER;
BEGIN
  SELECT AVG(embedding)::vector(768), COUNT(*)::INTEGER
    INTO v_centroid, v_n
    FROM press_cluster_view
    WHERE model = p_model;

  IF v_n = 0 OR v_centroid IS NULL THEN
    DELETE FROM press_cluster_centroid WHERE press_cluster_centroid.model = p_model;
    RETURN QUERY SELECT p_model, 0, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  INSERT INTO press_cluster_centroid (model, centroid, n_samples, computed_at)
  VALUES (p_model, v_centroid, v_n, now())
  ON CONFLICT (model) DO UPDATE
    SET centroid    = EXCLUDED.centroid,
        n_samples   = EXCLUDED.n_samples,
        computed_at = EXCLUDED.computed_at;

  RETURN QUERY SELECT p_model, v_n, now();
END;
$$;

COMMENT ON FUNCTION refresh_press_cluster_centroid(TEXT) IS
  'Recompute the press-cluster centroid (mean embedding) for the given model. Reads from press_cluster_view — automatically includes any source that the view UNIONs. Idempotent.';

-- ---------------------------------------------------------------------------
-- 5) refresh_press_similarity_knn — k-NN top-K over the view
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_press_similarity_knn(p_model TEXT, p_k INTEGER DEFAULT 5)
RETURNS TABLE(updated_n INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  SET LOCAL ivfflat.probes = 50;

  WITH new_sim AS (
    SELECT pe.publication_id,
           AVG(1.0 - (pe.embedding <=> ref.embedding)) AS sim
    FROM publication_embeddings pe
    CROSS JOIN LATERAL (
      SELECT pc.embedding
      FROM press_cluster_view pc
      WHERE pc.model = p_model
        AND pc.exclude_pub_id IS DISTINCT FROM pe.publication_id
      ORDER BY pe.embedding <=> pc.embedding
      LIMIT p_k
    ) ref
    WHERE pe.model = p_model
    GROUP BY pe.publication_id
  ),
  updated AS (
    UPDATE publications p
       SET press_similarity = ns.sim,
           updated_at = now()
      FROM new_sim ns
     WHERE p.id = ns.publication_id
       AND (p.press_similarity IS NULL
            OR ABS(p.press_similarity - ns.sim) > 1e-6)
    RETURNING 1
  )
  SELECT COUNT(*)::INTEGER INTO v_updated FROM updated;
  RETURN QUERY SELECT v_updated;
END;
$$;

COMMENT ON FUNCTION refresh_press_similarity_knn(TEXT, INTEGER) IS
  'Mean cosine of top-K nearest pressed items (self excluded via exclude_pub_id). Cluster comes from press_cluster_view — spans publication_embeddings (matched) + press_release_embeddings (orphans). K=5 default.';

-- ---------------------------------------------------------------------------
-- 6) similar_pressed_pubs — top-N nearest, exposes routing fields
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS similar_pressed_pubs(UUID, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION similar_pressed_pubs(
  p_pub_id UUID,
  p_model  TEXT DEFAULT 'allenai/specter2_base',
  p_limit  INTEGER DEFAULT 3
)
RETURNS TABLE(
  kind             TEXT,        -- 'publication' | 'orphan'
  publication_id   UUID,        -- NULL for orphans
  press_release_id UUID,        -- always non-null (every cluster item is a press_release)
  similarity       DOUBLE PRECISION,
  title            TEXT,
  released_at      DATE,
  press_url        TEXT         -- press_release.url — used for orphan-routing
)
LANGUAGE plpgsql STABLE
-- Function-attribute SET (vs `SET LOCAL` inline, which Postgres rejects for
-- STABLE). Forces exact NN search; with ~142 cluster items the seq scan is
-- cheap and recall is full.
SET ivfflat.probes TO 50
AS $$
BEGIN
  RETURN QUERY
  WITH q AS (
    SELECT pe0.embedding
    FROM publication_embeddings pe0
    WHERE pe0.publication_id = p_pub_id AND pe0.model = p_model
  )
  SELECT
    pc.kind,
    pc.publication_id,
    pc.press_release_id,
    (1.0 - (pc.embedding <=> q.embedding))::DOUBLE PRECISION AS similarity,
    pc.title,
    pc.released_at,
    pc.press_url
  FROM press_cluster_view pc
  CROSS JOIN q
  WHERE pc.model = p_model
    AND pc.exclude_pub_id IS DISTINCT FROM p_pub_id
  ORDER BY pc.embedding <=> q.embedding
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION similar_pressed_pubs(UUID, TEXT, INTEGER) IS
  'Top-N nearest cluster items for a given pub. Returns `kind` discriminator + press_url so the UI routes matched items to /publications/[id] and orphans to the press_release.url (orphan papers have no internal detail page).';
