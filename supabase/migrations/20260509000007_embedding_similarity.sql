-- Embedding-Similarity infrastructure for "press-cluster" recommendations.
--
-- Goal: persist a vector embedding per publication, compute a centroid
-- over historically pressed pubs, materialize a per-pub similarity score,
-- expose a fast nearest-neighbor lookup.
--
-- Embedding model: SPECTER2 (allenai/specter2_base, 768-dim cosine).
-- Stored as `vector(768)` so we can swap models later by adding a `model`
-- column distinction; for now we keep one active model.

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- 1) per-publication embedding
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS publication_embeddings (
  publication_id UUID PRIMARY KEY REFERENCES publications(id) ON DELETE CASCADE,
  model          TEXT NOT NULL,
  embedding      vector(768) NOT NULL,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_text_hash TEXT,
  CONSTRAINT publication_embeddings_model_chk CHECK (model <> '')
);

COMMENT ON TABLE  publication_embeddings IS
  'SPECTER2 / sentence-transformer embedding per publication. ON DELETE CASCADE so vector goes with the pub. source_text_hash lets a refresh script skip pubs whose title+abstract has not changed.';
COMMENT ON COLUMN publication_embeddings.model IS
  'Embedding model identifier, e.g. allenai/specter2_base. One row per pub for one active model — when migrating models, drop+rebuild.';
COMMENT ON COLUMN publication_embeddings.source_text_hash IS
  'sha256 of the title+abstract used to compute the embedding. Used by the recompute script to skip unchanged pubs.';

CREATE INDEX IF NOT EXISTS publication_embeddings_model_idx
  ON publication_embeddings (model);

-- ivfflat for cosine similarity (lists=50 is reasonable for n~7k).
-- Built after populating data; create here so it exists, will be rebuilt
-- after bulk insert.
CREATE INDEX IF NOT EXISTS publication_embeddings_cosine_ivfflat
  ON publication_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- ---------------------------------------------------------------------------
-- 2) press-cluster centroid (one row per active model)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS press_cluster_centroid (
  model        TEXT PRIMARY KEY,
  centroid     vector(768) NOT NULL,
  n_samples    INTEGER NOT NULL,
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE press_cluster_centroid IS
  'Mean embedding over publications that have a press_release (i.e. is in press_releases with publication_id NOT NULL AND have an embedding). Recomputed via refresh_press_cluster_centroid() after press_releases insert/update or new embeddings.';

-- ---------------------------------------------------------------------------
-- 3) materialised similarity column on publications
-- ---------------------------------------------------------------------------
ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS press_similarity DOUBLE PRECISION;

COMMENT ON COLUMN publications.press_similarity IS
  'Mean cosine over the top-5 nearest historically pressed publications (excl. self) in SPECTER2 embedding space. NULL if no embedding. Updated by refresh_press_similarity_knn() after press_releases changes or new embeddings. Higher = more semantically similar to what the press office historically picked.';

CREATE INDEX IF NOT EXISTS publications_press_similarity_idx
  ON publications (press_similarity DESC NULLS LAST);

-- ---------------------------------------------------------------------------
-- 4) refresh functions
-- ---------------------------------------------------------------------------

-- Recompute centroid for one model. Called after press_releases changes
-- or after a substantial batch of new embeddings.
CREATE OR REPLACE FUNCTION refresh_press_cluster_centroid(p_model TEXT)
-- NOTE: out param is named `out_model` (not `model`) to avoid ambiguity with
-- the press_cluster_centroid.model column inside the INSERT…ON CONFLICT clause.
RETURNS TABLE(out_model TEXT, n_samples INTEGER, computed_at TIMESTAMPTZ)
LANGUAGE plpgsql
AS $$
DECLARE
  v_centroid vector(768);
  v_n INTEGER;
BEGIN
  SELECT
    -- pgvector AVG aggregate is element-wise mean
    AVG(pe.embedding)::vector(768),
    COUNT(*)
  INTO v_centroid, v_n
  FROM publication_embeddings pe
  WHERE pe.model = p_model
    AND EXISTS (SELECT 1 FROM press_releases pr
                WHERE pr.publication_id = pe.publication_id);

  IF v_n = 0 OR v_centroid IS NULL THEN
    -- nothing to do; remove stale centroid for this model
    DELETE FROM press_cluster_centroid WHERE press_cluster_centroid.model = p_model;
    RETURN QUERY SELECT p_model, 0, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  INSERT INTO press_cluster_centroid (model, centroid, n_samples, computed_at)
  VALUES (p_model, v_centroid, v_n, now())
  ON CONFLICT (model) DO UPDATE
    SET centroid = EXCLUDED.centroid,
        n_samples = EXCLUDED.n_samples,
        computed_at = EXCLUDED.computed_at;

  RETURN QUERY SELECT p_model, v_n, now();
END;
$$;

COMMENT ON FUNCTION refresh_press_cluster_centroid(TEXT) IS
  'Recompute the press-cluster centroid for the given embedding model. Returns one row with the post-update n_samples and timestamp. Idempotent.';

-- Recompute press_similarity for all pubs with an embedding given the
-- current centroid for that model.
CREATE OR REPLACE FUNCTION refresh_press_similarity(p_model TEXT)
RETURNS TABLE(updated_n INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  v_centroid vector(768);
  v_updated INTEGER;
BEGIN
  SELECT centroid INTO v_centroid
  FROM press_cluster_centroid
  WHERE model = p_model;

  IF v_centroid IS NULL THEN
    -- no centroid — null out similarity to avoid stale values
    UPDATE publications
       SET press_similarity = NULL,
           updated_at = now()
     WHERE press_similarity IS NOT NULL;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN QUERY SELECT v_updated;
    RETURN;
  END IF;

  -- pgvector cosine distance = 1 - cosine_similarity, so similarity = 1 - <=>.
  -- Touch updated_at on rows whose value materially changes (>1e-6).
  WITH new_sim AS (
    SELECT pe.publication_id,
           1.0 - (pe.embedding <=> v_centroid) AS sim
    FROM publication_embeddings pe
    WHERE pe.model = p_model
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

COMMENT ON FUNCTION refresh_press_similarity(TEXT) IS
  'Materialize publications.press_similarity from publication_embeddings + press_cluster_centroid for the given model. Empirically dominated by short generic texts close to the population mean — kept for observability/comparison only. Use refresh_press_similarity_knn for production scoring.';

-- k-NN average similarity: mean cosine to top-K nearest pressed pubs (excluding
-- self). Empirically much sharper signal than centroid-based — the centroid
-- attracts generic short documents close to the population mean. Validated
-- 2026-05-09: ΔAP +24% vs centroid-based scoring.
CREATE OR REPLACE FUNCTION refresh_press_similarity_knn(p_model TEXT, p_k INTEGER DEFAULT 5)
RETURNS TABLE(updated_n INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  -- ivfflat default probes=1 silently drops ~1% of pubs whose nearest
  -- pressed-pub neighbours fall in non-probed lists. Force exact search:
  -- with ~114 pressed pubs the sequential scan is fast enough.
  SET LOCAL ivfflat.probes = 50;

  WITH new_sim AS (
    SELECT pe.publication_id,
           AVG(1.0 - (pe.embedding <=> pe2.embedding)) AS sim
    FROM publication_embeddings pe
    CROSS JOIN LATERAL (
      SELECT pe2.embedding
      FROM publication_embeddings pe2
      JOIN press_releases pr ON pr.publication_id = pe2.publication_id
      WHERE pe2.model = p_model
        AND pe2.publication_id <> pe.publication_id
      ORDER BY pe.embedding <=> pe2.embedding
      LIMIT p_k
    ) pe2
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
  'Mean cosine of top-K nearest pressed publications (self excluded). Production scoring function. K=5 default. Runs ~26s on n=7375 / 114 pressed via ivfflat index.';

-- Convenience: refresh both centroid (observability) + k-NN similarity (scoring).
CREATE OR REPLACE FUNCTION refresh_embedding_pipeline(p_model TEXT)
RETURNS TABLE(centroid_n INTEGER, similarity_updated INTEGER, ran_at TIMESTAMPTZ)
LANGUAGE plpgsql
AS $$
DECLARE
  v_n INTEGER;
  v_upd INTEGER;
BEGIN
  -- Centroid is kept for observability (n_samples in press_cluster_centroid)
  -- but no longer feeds press_similarity. k-NN top-5 is empirically more
  -- aligned with is_pressed (ΔAP +24% vs centroid).
  SELECT n_samples INTO v_n FROM refresh_press_cluster_centroid(p_model);
  SELECT updated_n INTO v_upd FROM refresh_press_similarity_knn(p_model, 5);
  RETURN QUERY SELECT v_n, v_upd, now();
END;
$$;

COMMENT ON FUNCTION refresh_embedding_pipeline(TEXT) IS
  'Convenience: refresh_press_cluster_centroid (observability) + refresh_press_similarity_knn (scoring). Call after press_releases changes or after batch embedding insert.';

-- ---------------------------------------------------------------------------
-- 5) trigger on press_releases — keep centroid + similarity fresh
--    after press_release inserts/updates. Defers to STATEMENT level so
--    bulk operations only refresh once.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_press_releases_refresh_embedding()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Refresh asynchronously is overkill here (n=101); just do it inline.
  -- One model only for now: 'allenai/specter2_base'.
  PERFORM refresh_embedding_pipeline('allenai/specter2_base');
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS press_releases_refresh_embedding ON press_releases;
CREATE TRIGGER press_releases_refresh_embedding
  AFTER INSERT OR UPDATE OF publication_id OR DELETE
  ON press_releases
  FOR EACH STATEMENT
  EXECUTE FUNCTION trg_press_releases_refresh_embedding();

COMMENT ON TRIGGER press_releases_refresh_embedding ON press_releases IS
  'After any change to press_releases.publication_id (which defines the press cohort), recompute the centroid + per-pub similarity. STATEMENT-level so a multi-row insert refreshes once.';

-- ---------------------------------------------------------------------------
-- 6) view: top-3 nearest pressed pubs per query pub
--    (parameterized query helper; consumers pass a publication_id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION similar_pressed_pubs(
  p_pub_id UUID,
  p_model  TEXT DEFAULT 'allenai/specter2_base',
  p_limit  INTEGER DEFAULT 3
)
RETURNS TABLE(
  publication_id UUID,
  similarity     DOUBLE PRECISION,
  title          TEXT,
  released_at    DATE
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  -- See refresh_press_similarity_knn for the ivfflat.probes rationale.
  SET LOCAL ivfflat.probes = 50;
  RETURN QUERY
  WITH q AS (
    SELECT embedding FROM publication_embeddings
    WHERE publication_id = p_pub_id AND model = p_model
  )
  SELECT
    pe.publication_id,
    (1.0 - (pe.embedding <=> q.embedding))::DOUBLE PRECISION AS similarity,
    p.title,
    pr.released_at
  FROM publication_embeddings pe
  CROSS JOIN q
  JOIN publications p ON p.id = pe.publication_id
  JOIN press_releases pr ON pr.publication_id = pe.publication_id
  WHERE pe.model = p_model
    AND pe.publication_id <> p_pub_id
  ORDER BY pe.embedding <=> q.embedding
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION similar_pressed_pubs(UUID, TEXT, INTEGER) IS
  'Top-N nearest historically-pressed publications for a given pub by cosine similarity. Used by the detail-page "Press-Referenz" card.';
