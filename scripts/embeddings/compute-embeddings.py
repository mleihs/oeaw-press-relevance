#!/usr/bin/env python3
"""
Compute SPECTER2 embeddings for everything that feeds the press-cluster
k-NN search:

  - publications  ─────────────────────────────────────> publication_embeddings
  - orphan press_releases (publication_id IS NULL) ────> press_release_embeddings

Both tables are joined in refresh_press_similarity_knn / similar_pressed_pubs
to form the press-cluster reference set. Splitting orphans into their own
table avoids polluting `publications` with non-WebDB rows while still
recovering the ~20% reference signal that orphan press_releases carry.

Both passes share the same model, tokenizer, batch sizing, hash-skip
idempotency and bulk-upsert. The only thing that differs is the SQL fetch
and the target table.

After both passes run, refresh_embedding_pipeline(model) recomputes the
centroid (observability) + materializes publications.press_similarity via
the k-NN top-5 mean cosine (production scoring).

Architecture:
  publications  ──┐                            ┌── publication_embeddings ──┐
                  ├── compute embedding ──────>┤                            ├──┐
  press_releases ─┘  (only orphans w/o pub)    └── press_release_embeddings ┘  │
  (orphan subset)                                                              │
                                                                               ▼
            refresh_press_cluster_centroid  ◀────────  press-cluster (UNION ALL)
            refresh_press_similarity_knn    ◀────────  same source

Model: allenai/specter2_base + proximity adapter (allenai/specter2).
Input format per the SPECTER2 paper: TITLE [SEP] ABSTRACT, CLS-token of
the last hidden state is the document embedding.

Usage:
  scripts/embeddings/.venv/bin/python scripts/embeddings/compute-embeddings.py
      [--target=local|prod]  [--limit=N]  [--all]  [--scope=analyzed|all]
      [--no-refresh]  [--skip-orphans]  [--max-pubs=N]

Defaults:
  - target=local
  - both passes run (publications + orphans)
  - hash-idempotent: skips rows whose source text is unchanged
  - refreshes centroid + similarity at the end
"""
from __future__ import annotations
import argparse
import gc
import hashlib
import os
import sys
import time
from dataclasses import dataclass

import numpy as np
import psycopg2
import psycopg2.extras
import torch
from transformers import AutoTokenizer
from adapters import AutoAdapterModel

MODEL_NAME = "allenai/specter2_base"
ADAPTER    = "allenai/specter2"
MODEL_TAG  = "allenai/specter2_base"  # value stored in *_embeddings.model
EMBED_DIM  = 768
BATCH_SIZE = 16
MAX_TOKENS = 512

LOCAL_URL = "postgres://postgres:postgres@127.0.0.1:54422/postgres"
PROD_CRED_PATH = os.path.expanduser("~/.config/oeaw-press-release/prod-credentials")


# ---------------------------------------------------------------------------
# DB / utilities (unchanged)
# ---------------------------------------------------------------------------

def load_db_url(target: str) -> str:
    if target == "prod":
        with open(PROD_CRED_PATH, "r") as f:
            for line in f:
                if line.startswith("PROD_DB_URL_POOLER="):
                    return line.split("=", 1)[1].strip()
        raise RuntimeError(f"PROD_DB_URL_POOLER not found in {PROD_CRED_PATH}")
    return LOCAL_URL


def text_hash(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:32]


def compose(title: str | None, abstract: str | None) -> str:
    """SPECTER2 input format: TITLE [SEP] ABSTRACT. Empty fields drop out."""
    t = (title or "").strip()
    a = (abstract or "").strip()
    if t and a:
        return f"{t}[SEP]{a}"
    return t or a or ""


def vector_literal(arr: np.ndarray) -> str:
    """pgvector text literal: [v1,v2,...]"""
    return "[" + ",".join(f"{x:.7f}" for x in arr.tolist()) + "]"


def encode_batch(model, tokenizer, texts: list[str], device: str) -> np.ndarray:
    enc = tokenizer(texts, padding=True, truncation=True, max_length=MAX_TOKENS,
                    return_tensors="pt").to(device)
    with torch.no_grad():
        out = model(**enc)
    cls = out.last_hidden_state[:, 0, :].detach().cpu().numpy().astype(np.float32)

    # Defensive: pgvector rejects NaN/Inf at INSERT time with a cryptic
    # "invalid input syntax" error mid-batch. Catching here surfaces the
    # actual cause ("which input texts produced non-finite embeddings?")
    # with a diagnostic preview, so the operator can blacklist or fix
    # the source row instead of guessing.
    if not np.isfinite(cls).all():
        bad_idx = np.where(~np.isfinite(cls).all(axis=1))[0].tolist()
        previews = [f"  [{i}] {texts[i][:80]!r}" for i in bad_idx]
        raise ValueError(
            f"Non-finite values in SPECTER2 embedding for {len(bad_idx)} of "
            f"{len(texts)} texts — pgvector would reject these. Inputs:\n"
            + "\n".join(previews)
        )
    return cls


# ---------------------------------------------------------------------------
# Embedding-target abstraction — what to embed, where to store it
# ---------------------------------------------------------------------------

@dataclass
class EmbedTarget:
    """A row of source-text to embed.

    `text` is the already-composed `TITLE [SEP] ABSTRACT` string; `source_hash`
    its sha256-truncated digest. When `old_hash` equals `source_hash`, the
    target is skipped (idempotent re-runs).

    The destination (table, id-column) is NOT carried per-target — it's a
    property of the whole pass, passed once to `process_pass`. Keeps the
    dataclass to pure data and makes target-mixing structurally impossible."""
    source_id: str            # PK of the source row (pub_id or press_release_id)
    text: str
    source_hash: str
    old_hash: str | None


def _rows_to_targets(rows) -> list[EmbedTarget]:
    """Shared (row -> EmbedTarget) conversion — both fetchers return the
    same 4-tuple shape (id, title, abstract, old_hash), so the compose +
    hash logic lives in exactly one place."""
    out: list[EmbedTarget] = []
    for row_id, title, abstract, old_hash in rows:
        text = compose(title, abstract)
        out.append(EmbedTarget(
            source_id=row_id,
            text=text,
            source_hash=text_hash(text),
            old_hash=old_hash,
        ))
    return out


# ---------------------------------------------------------------------------
# Fetchers — one per source kind, both returning the same EmbedTarget shape
# ---------------------------------------------------------------------------

def fetch_publication_targets(cur, *, limit: int | None, all_: bool, scope: str, since: str | None = None) -> list[EmbedTarget]:
    """Publications that should be embedded.

    Filter:
      - non-empty title
      - scope=analyzed: only pubs with press_score IS NOT NULL OR a press_release
        (the cohort the triage pipeline actually ranks against)
      - scope=all: every pub with a title

    Source text fallback chain:
      enriched_abstract > abstract > summary_de > summary_en > (title only)
    """
    where = ["COALESCE(p.title, '') <> ''"]
    if scope == "analyzed":
        where.append("(p.press_score IS NOT NULL "
                     "OR EXISTS (SELECT 1 FROM press_releases pr WHERE pr.publication_id = p.id))")
    # MODEL_TAG (in the LEFT JOIN) is the first %s; a WHERE %s must follow it in
    # appearance order and LIMIT must be last — keep params[] in that order.
    params: list = [MODEL_TAG]
    if since:
        where.append("p.published_at >= %s")
        params.append(since)
    q = f"""
      SELECT
        p.id::text,
        COALESCE(p.title, '')                 AS title,
        COALESCE(NULLIF(p.enriched_abstract,''), NULLIF(p.abstract,''),
                 NULLIF(p.summary_de,''),     NULLIF(p.summary_en,''),
                 '')                          AS abstract,
        pe.source_text_hash                   AS old_hash
      FROM publications p
      LEFT JOIN publication_embeddings pe
        ON pe.publication_id = p.id AND pe.model = %s
      WHERE {' AND '.join(where)}
    """
    if limit and not all_:
        q += " LIMIT %s"
        params.append(limit)
    cur.execute(q, params)
    return _rows_to_targets(cur.fetchall())


def fetch_orphan_targets(cur, *, limit: int | None, all_: bool) -> list[EmbedTarget]:
    """Orphan press_releases (publication_id IS NULL) — pressed papers we
    don't have in WebDB. They carry CrossRef/OpenAlex-enriched title +
    abstract on the press_releases row itself.

    Title fallback: paper_title > news_title (paper_title is usually EN
    from CrossRef; news_title is the German press headline).
    """
    q = """
      SELECT
        pr.id::text,
        COALESCE(NULLIF(pr.paper_title, ''), NULLIF(pr.news_title, ''), '') AS title,
        COALESCE(NULLIF(pr.abstract, ''), '')                                AS abstract,
        pre.source_text_hash                                                 AS old_hash
      FROM press_releases pr
      LEFT JOIN press_release_embeddings pre
        ON pre.press_release_id = pr.id AND pre.model = %s
      WHERE pr.publication_id IS NULL
        AND COALESCE(pr.paper_title, pr.news_title, '') <> ''
    """
    params: list = [MODEL_TAG]
    if limit and not all_:
        q += " LIMIT %s"
        params.append(limit)
    cur.execute(q, params)
    return _rows_to_targets(cur.fetchall())


# ---------------------------------------------------------------------------
# Generic pass — process a list of EmbedTargets sharing the same target table
# ---------------------------------------------------------------------------

def process_pass(
    *,
    pass_name: str,
    targets: list[EmbedTarget],
    target_table: str,
    id_column: str,
    force_all: bool,
    cur,
    conn,
    model,
    tokenizer,
    device: str,
    max_rows: int | None = None,
) -> int:
    """Encodes + upserts a batch of targets into the given target table.

    `target_table` / `id_column` are pass-level, not per-target — keeps the
    EmbedTarget dataclass to pure data and makes accidental table-mixing
    structurally impossible."""
    if not targets:
        print(f"[{pass_name:>8}] no targets — skipping pass.")
        return 0

    todo: list[EmbedTarget] = []
    skipped = 0
    for t in targets:
        if not force_all and t.old_hash is not None and t.old_hash == t.source_hash:
            skipped += 1
            continue
        todo.append(t)

    # Length-bucketing: with dynamic padding (padding=True), batching
    # similar-length texts together avoids over-padding shorter ones —
    # ~2-3x speedup vs random order.
    todo.sort(key=lambda x: len(x.text))

    n_total = len(todo)
    print(f"[{pass_name:>8}] {n_total} to embed; {skipped} unchanged & skipped.")

    if n_total == 0:
        return 0

    inserted = 0
    t_start = time.time()
    for batch_start in range(0, n_total, BATCH_SIZE):
        if max_rows is not None and inserted >= max_rows:
            print(f"[{pass_name:>8}] reached --max-pubs={max_rows}, exiting pass early.")
            break

        batch = todo[batch_start: batch_start + BATCH_SIZE]
        texts = [t.text for t in batch]
        embs = encode_batch(model, tokenizer, texts, device=device)

        rows_for_db = [
            (t.source_id, MODEL_TAG, vector_literal(v), t.source_hash)
            for t, v in zip(batch, embs)
        ]
        psycopg2.extras.execute_values(
            cur,
            f"""
            INSERT INTO {target_table}
              ({id_column}, model, embedding, computed_at, source_text_hash)
            VALUES %s
            ON CONFLICT ({id_column}) DO UPDATE
              SET model            = EXCLUDED.model,
                  embedding        = EXCLUDED.embedding,
                  computed_at      = EXCLUDED.computed_at,
                  source_text_hash = EXCLUDED.source_text_hash
            """,
            rows_for_db,
            template="(%s, %s, %s::vector, now(), %s)"
        )
        conn.commit()
        inserted += len(batch)

        # Aggressively free tensor memory — WSL2 OOM-risk (memory wsl2_oom_risk.md).
        del embs, rows_for_db
        if (batch_start // BATCH_SIZE) % 16 == 0:
            gc.collect()
        if (batch_start // BATCH_SIZE) % 5 == 0 or batch_start + BATCH_SIZE >= n_total:
            elapsed = time.time() - t_start
            rate = inserted / elapsed if elapsed > 0 else 0
            eta = (n_total - inserted) / rate if rate > 0 else 0
            print(f"[{pass_name:>8}] {inserted}/{n_total} ({100*inserted/n_total:.1f}%)  "
                  f"rate={rate:.1f}/s  eta={eta:.0f}s")

    print(f"[{pass_name:>8}] done — {inserted} rows in {time.time() - t_start:.1f}s")
    return inserted


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", default="local", choices=["local", "prod"])
    ap.add_argument("--limit", type=int, default=None,
                    help="limit per pass (publications + orphans)")
    ap.add_argument("--all", action="store_true",
                    help="recompute even if hash unchanged")
    ap.add_argument("--scope", default="analyzed", choices=["analyzed", "all"],
                    help="publications-pass scope. analyzed (default): only press_score-having + pressed pubs; all: every pub with title")
    ap.add_argument("--since", default=None,
                    help="only embed publications with published_at >= this date (YYYY-MM-DD) — "
                         "scope a SPECTER2 backfill to one import window (orphans pass is unaffected)")
    ap.add_argument("--no-refresh", action="store_true",
                    help="skip refresh_embedding_pipeline at the end")
    ap.add_argument("--skip-orphans", action="store_true",
                    help="skip the orphan press_releases pass (useful for chunked pub-only runs)")
    ap.add_argument("--max-pubs", type=int, default=None,
                    help="exit cleanly after this many rows are embedded in the publications-pass "
                         "(chunked-restart workaround for PyTorch CPU memory leak; doesn't apply to orphans)")
    args = ap.parse_args()

    print(f"[setup] target={args.target}, model={MODEL_NAME}, adapter={ADAPTER}")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[setup] device={device}")

    print(f"[setup] loading tokenizer + model + adapter (may download ~440MB once)...")
    t0 = time.time()
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoAdapterModel.from_pretrained(MODEL_NAME)
    model.load_adapter(ADAPTER, source="hf", load_as="specter2", set_active=True)
    model.set_active_adapters("specter2")
    model.to(device)
    model.eval()
    print(f"[setup] model ready ({time.time() - t0:.1f}s); active adapters: {model.active_adapters}")

    conn = psycopg2.connect(load_db_url(args.target))
    conn.autocommit = False
    cur = conn.cursor()

    # Pre-flight stats
    cur.execute("SELECT COUNT(*) FROM publication_embeddings WHERE model=%s", (MODEL_TAG,))
    n_pub_existing = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM publications WHERE COALESCE(title,'') <> ''")
    n_pub_eligible = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM press_release_embeddings WHERE model=%s", (MODEL_TAG,))
    n_orphan_existing = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM press_releases "
                "WHERE publication_id IS NULL AND COALESCE(paper_title, news_title, '') <> ''")
    n_orphan_eligible = cur.fetchone()[0]
    print(f"[setup] pubs:    {n_pub_existing} embedded / {n_pub_eligible} eligible")
    print(f"[setup] orphans: {n_orphan_existing} embedded / {n_orphan_eligible} eligible")

    # ─── Pass 1: publications ───────────────────────────────────────────────
    pub_targets = fetch_publication_targets(
        cur, limit=args.limit, all_=args.all, scope=args.scope, since=args.since,
    )
    n_pub_done = process_pass(
        pass_name="pubs", targets=pub_targets,
        target_table="publication_embeddings", id_column="publication_id",
        force_all=args.all,
        cur=cur, conn=conn, model=model, tokenizer=tokenizer, device=device,
        max_rows=args.max_pubs,
    )

    # ─── Pass 2: orphan press_releases ──────────────────────────────────────
    n_orphan_done = 0
    if not args.skip_orphans:
        orphan_targets = fetch_orphan_targets(cur, limit=args.limit, all_=args.all)
        n_orphan_done = process_pass(
            pass_name="orphans", targets=orphan_targets,
            target_table="press_release_embeddings", id_column="press_release_id",
            force_all=args.all,
            cur=cur, conn=conn, model=model, tokenizer=tokenizer, device=device,
            max_rows=None,  # orphans are few; no chunking needed
        )

    # ─── Index maintenance + refresh ────────────────────────────────────────
    if n_pub_done > 0:
        # IVFFlat recall improves after bulk insert — only matters for pubs
        # (the orphan table is tiny and has no IVFFlat index).
        print(f"[index] REINDEX publication_embeddings_cosine_ivfflat ...")
        cur.execute("REINDEX INDEX publication_embeddings_cosine_ivfflat")
        conn.commit()

    if not args.no_refresh:
        print(f"[refr ] calling refresh_embedding_pipeline('{MODEL_TAG}')...")
        cur.execute("SELECT * FROM refresh_embedding_pipeline(%s)", (MODEL_TAG,))
        result = cur.fetchall()
        print(f"[refr ] result: centroid_n={result[0][0]}, similarity_updated={result[0][1]}")
        conn.commit()

    cur.close()
    conn.close()
    print(f"[done ] embedded pubs={n_pub_done}, orphans={n_orphan_done}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
