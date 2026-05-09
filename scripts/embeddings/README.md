# SPECTER2 Embedding Pipeline

Computes per-publication SPECTER2 (`allenai/specter2_base` + proximity adapter)
embeddings, persists into `publication_embeddings` (pgvector), and refreshes
`publications.press_similarity` via k-NN avg over the top-5 nearest pressed
publications.

## Why exists

The press team's historical press-release decisions are the ground truth for
which publications are pitchworthy. Cosine-similarity to those 101 pressed
pubs is the second signal alongside the V2 LLM-derived `press_score`.

Centroid-Cosine was tested first and rejected (dominated by short generic
texts close to population mean). k-NN top-5 average is the production
function — see memory `centroid_vs_knn_lesson.md`.

## Files

```
compute-embeddings.py   # main script — embed N pubs, upsert into DB
run-chunked.sh          # bash loop that calls the script in chunks of 400
                        # to side-step the PyTorch CPU memory leak
.venv/                  # Python venv (managed by uv); torch 2.9 CPU,
                        # transformers, adapters, sentence-transformers,
                        # psycopg2-binary
```

## Quick start

```bash
# initial bulk run on local DB (analyzed + pressed pubs only, ~7355 pubs)
./scripts/embeddings/run-chunked.sh 400

# limit to N pubs (for testing)
scripts/embeddings/.venv/bin/python scripts/embeddings/compute-embeddings.py \
  --limit=20

# scope can be 'analyzed' (default) or 'all' (every pub with title)
scripts/embeddings/.venv/bin/python scripts/embeddings/compute-embeddings.py \
  --scope=all

# for prod (pooler URL from ~/.config/oeaw-press-release/prod-credentials)
TARGET=prod ./scripts/embeddings/run-chunked.sh 400

# refresh similarity only (no compute), e.g. after editing press_releases
psql $LOCAL_URL -c "SELECT * FROM refresh_embedding_pipeline('allenai/specter2_base')"
```

## How the script decides what to embed

For each pub it composes `title [SEP] abstract` (abstract falls back via
`enriched_abstract → abstract → summary_de → summary_en`), hashes the text,
and skips pubs whose embedding row already has a matching `source_text_hash`.

This makes the script idempotent and safe to re-run (e.g. after a pub's
abstract is enriched).

## Triggers

`press_releases_refresh_embedding` fires AFTER INSERT/UPDATE OF
publication_id/DELETE on `press_releases`, calling
`refresh_embedding_pipeline('allenai/specter2_base')`. So adding a new press
release auto-recomputes the centroid + per-pub similarity. STATEMENT-level
trigger so a multi-row insert refreshes once.

## Rates / Compute

CPU-only (no CUDA on WSL2):
- ~1.0–1.3 pubs/s with batch_size=16 on a 4-core box.
- 7,355 pubs ≈ 90 min via chunked-restart (each chunk: fresh Python,
  no memory leak).
- 7,375 × 114 cosines for `refresh_press_similarity_knn` ≈ 26 s via the
  ivfflat index (`embedding vector_cosine_ops`).

## Memory health (WSL2 specific)

PyTorch CPU memory accumulates across batches. A single uninterrupted run
on 7k pubs OOM-killed at RSS ~2.2 GB. The chunked-restart loop in
`run-chunked.sh` exits cleanly after `--max-pubs=400` and lets a fresh
process resume. Tested 2026-05-09: 11 chunks completed back-to-back without
OOM. Per memory `wsl2_oom_risk.md`.

## Re-embedding when SPECTER2 versions / texts change

Bump the model identifier or set `--all` to force re-compute:

```bash
# clear out existing rows for this model
psql $LOCAL_URL -c "DELETE FROM publication_embeddings WHERE model='allenai/specter2_base'"
# rebuild
./scripts/embeddings/run-chunked.sh 400
```
