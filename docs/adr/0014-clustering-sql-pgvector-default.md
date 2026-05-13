---
date: 2026-05-13
status: accepted
deciders: Phase-A5/A6 audit session
supersedes: none
---

# 0014 — Story clustering: SQL pgvector-DBSCAN as default; Python only on documented failure

## Context

Phase A6 ([ADR 0013](0013-story-schema-cluster-first.md)) needs to
produce story clusters from the existing 768-dim SPECTER2 publication
embeddings (`publication_embeddings`, ivfflat cosine, populated by
`scripts/embeddings/compute-embeddings.py`). Two viable paths:

- **SQL** — seed-and-expand DBSCAN-like over `pgvector` cosine
  distance, run as a `LANGUAGE sql` / plpgsql function.
- **Python** — `hdbscan` or `scikit-learn DBSCAN` in a sidecar script,
  bulk-read embeddings, bulk-write `publication_stories`.

`pgvector` is already production: `similar_pressed_pubs()`,
`refresh_press_similarity_knn()`, `press_cluster_view` (the
publication+orphan union view at `schema.ts:636`). Self-hosters today
need only Postgres + Node — no Python in the deploy. `press_similarity`
median for known-pressed pairs is ≈0.85 (`memory/centroid_vs_knn_lesson.md`).

## Decision

**Default: SQL pgvector-based DBSCAN-like clustering** in a new
migration, exposed as a plpgsql function callable from any cron/admin
trigger. Algorithm:

1. **Seed:** pick the embedding furthest from any existing
   `stories.centroid` (cold-start: random unassigned pub).
2. **Expand:** gather all pubs with `1 - (embedding <=> seed) ≥ 0.82`
   to a candidate cluster.
3. **Commit:** if `member_count ≥ 3`, INSERT into `stories` +
   `publication_stories` (`confidence='auto'`). Otherwise discard;
   pub stays unassigned.
4. **Iterate** until no unassigned embeddings remain.
5. **Recompute centroids** as `AVG(embedding)` over members (pgvector
   built-in operator).

Threshold `eps = 0.82` is a conservative starting point (median of
known-pressed pairs ≈ 0.85; clustering wants tighter coherence). It
**must** be recalibrated after the first full pass against silhouette
or member-coherence signal; bake the calibration into A6 acceptance.

**Python-HDBSCAN is reserved as fallback.** Trigger condition: SQL
clustering produces unusable cluster quality (e.g. >40% singletons
after threshold calibration, or noise/cluster ratio worse than
HDBSCAN on a 1k-pub sample). The trigger must produce a new ADR
documenting the failure measurement and the Python-deploy story —
not a silent migration.

## Consequences

- ✅ Zero new runtime deps for self-hosters; matches
  [ADR 0005](0005-sql-functions-stay-in-postgres.md) (aggregation
  SQL stays in Postgres).
- ✅ Single round-trip — clustering runs next to the embeddings; no
  bulk-export → process → bulk-import dance.
- ✅ Refresh hook after enrichment batches is a one-line function call.
- ⚠️ Threshold calibration is empirical work, not a parameter sweep
  on synthetic data. First pass on real 38k-pub corpus will move the
  number; budget ~2h for it inside A6.
- ⚠️ DBSCAN-in-SQL is ~150-200 LOC plpgsql vs ~10 LOC Python — more
  code surface, but it stays in the migration file (testable, diff-able)
  and uses the same testing ladder as the existing six SQL functions
  ([ADR 0005](0005-sql-functions-stay-in-postgres.md) consequences).
- ↔️ Hierarchical density variations (HDBSCAN strength) are not modeled —
  one `eps` per pass. Acceptable in the OEAW corpus (single institution,
  comparable abstract density across orgunits); may not generalize.

## Alternatives considered

- **Python-HDBSCAN default.** Better algorithm theoretically, but adds
  a Python sidecar to every deploy and a "which clustering ran" answer
  to every incident. Rejected absent failure evidence.
- **K-Means.** Requires fixed `k`; no notion of "no cluster" for outliers.
  A6 explicitly needs singleton-tolerant clustering. Rejected.
- **ivfflat-only nearest-neighbor.** Already what `similar_pressed_pubs`
  does — produces suggestions, not story entities. Different shape.
  Rejected.

## References

- [ADR 0005](0005-sql-functions-stay-in-postgres.md) (Aggregation SQL stays in Postgres)
- [ADR 0013](0013-story-schema-cluster-first.md) (consumer of the centroids)
- `supabase/migrations/20260509000007_embedding_similarity.sql` (pgvector setup)
- `scripts/embeddings/compute-embeddings.py` (SPECTER2 768-dim)
- `memory/centroid_vs_knn_lesson.md` (threshold-baseline data)
- `ARCHITECTURE_PLAN.md` §A6 Sketch (clustering pseudocode)
