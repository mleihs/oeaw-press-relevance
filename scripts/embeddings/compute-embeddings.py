#!/usr/bin/env python3
"""
Compute SPECTER2 embeddings for all publications and persist into
publication_embeddings (pgvector). Idempotent: skips pubs whose
title+abstract hash hasn't changed.

After the bulk insert, calls refresh_embedding_pipeline(model) which
recomputes the press-cluster centroid and materializes
publications.press_similarity for every embedded pub.

Architecture:
  publications  ──┐
                  ├── compute embedding ──> publication_embeddings (vector(768))
                  ├── refresh_press_cluster_centroid ──> press_cluster_centroid
                  └── refresh_press_similarity ─────────> publications.press_similarity

Model: allenai/specter2_base + proximity adapter (allenai/specter2).
Input format per the SPECTER2 paper: TITLE [SEP] ABSTRACT, CLS-token of
last hidden state is the document embedding.

Usage:
  scripts/embeddings/.venv/bin/python scripts/embeddings/compute-embeddings.py
      [--target=local|prod]  [--limit=N]  [--all]  [--no-refresh]

Defaults:
  - target=local
  - only embeds pubs where embedding is missing or source_text_hash differs
  - refreshes centroid + similarity at the end
"""
from __future__ import annotations
import argparse
import gc
import hashlib
import os
import sys
import time
from typing import Iterable

import numpy as np
import psycopg2
import psycopg2.extras
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer
from adapters import AutoAdapterModel

MODEL_NAME = "allenai/specter2_base"
ADAPTER    = "allenai/specter2"
MODEL_TAG  = "allenai/specter2_base"  # what we store in publication_embeddings.model
EMBED_DIM  = 768
BATCH_SIZE = 16
MAX_TOKENS = 512

LOCAL_URL = "postgres://postgres:postgres@127.0.0.1:54422/postgres"
PROD_CRED_PATH = os.path.expanduser("~/.config/oeaw-press-release/prod-credentials")


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
    """SPECTER2 input format: TITLE [SEP] ABSTRACT.
    Tokenizer adds [SEP] between segments, so we just concatenate the two
    fields with a single space (the tokenizer treats them as one sequence
    here; the canonical form was originally TITLE</s>ABSTRACT but base+
    proximity adapter performs equivalently with concatenation in practice).
    For our use-case we use SEP-token as separator explicitly.
    """
    t = (title or "").strip()
    a = (abstract or "").strip()
    if t and a:
        return f"{t}[SEP]{a}"
    return t or a or ""


def fetch_targets(cur, *, limit: int | None, all_: bool, scope: str) -> list[tuple]:
    """
    Pubs we should embed:
      - have a non-empty title (or summary_de — fallback)
      - either no embedding row OR existing source_text_hash differs

    Scope:
      - "analyzed"  : only pubs with press_score IS NOT NULL OR a press_release
                       (the cohort the triage pipeline ranks against)
      - "all"       : every pub with a title

    Source text uses (title, COALESCE(enriched_abstract, abstract, summary_de, summary_en)).
    """
    where = ["COALESCE(p.title, '') <> ''"]
    if scope == "analyzed":
        where.append("(p.press_score IS NOT NULL "
                     "OR EXISTS (SELECT 1 FROM press_releases pr WHERE pr.publication_id = p.id))")
    q = f"""
      SELECT
        p.id,
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
    params = [MODEL_TAG]
    if limit and not all_:
        q += " LIMIT %s"
        params.append(limit)
    cur.execute(q, params)
    return cur.fetchall()


def needs_recompute(row, *, force_all: bool) -> tuple[bool, str, str]:
    pub_id, title, abstract, old_hash = row
    text = compose(title, abstract)
    h = text_hash(text)
    if force_all:
        return True, text, h
    if old_hash is None:
        return True, text, h
    return (h != old_hash), text, h


def encode_batch(model, tokenizer, texts: list[str], device: str) -> np.ndarray:
    enc = tokenizer(texts, padding=True, truncation=True, max_length=MAX_TOKENS,
                    return_tensors="pt").to(device)
    with torch.no_grad():
        out = model(**enc)
    # CLS token (first position of last hidden state) — SPECTER2 convention
    cls = out.last_hidden_state[:, 0, :].detach().cpu().numpy().astype(np.float32)
    return cls


def vector_literal(arr: np.ndarray) -> str:
    """pgvector text literal: [v1,v2,...]"""
    return "[" + ",".join(f"{x:.7f}" for x in arr.tolist()) + "]"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", default="local", choices=["local", "prod"])
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--all", action="store_true",
                    help="recompute even if hash unchanged")
    ap.add_argument("--scope", default="analyzed", choices=["analyzed", "all"],
                    help="analyzed: only press_score-having + pressed pubs (default); all: every pub with title")
    ap.add_argument("--no-refresh", action="store_true",
                    help="skip refresh_embedding_pipeline at the end")
    ap.add_argument("--max-pubs", type=int, default=None,
                    help="exit cleanly after this many pubs are embedded in this run "
                         "(useful for chunked restarts to side-step PyTorch CPU memory leak)")
    args = ap.parse_args()

    print(f"[setup] target={args.target}, model={MODEL_NAME}, adapter={ADAPTER}")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[setup] device={device}")

    print(f"[setup] loading tokenizer + model + adapter (this may download ~440MB once)...")
    t0 = time.time()
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoAdapterModel.from_pretrained(MODEL_NAME)
    model.load_adapter(ADAPTER, source="hf", load_as="specter2", set_active=True)
    # set_active=True is sometimes ignored by the adapters lib; re-assert.
    model.set_active_adapters("specter2")
    model.to(device)
    model.eval()
    print(f"[setup] model ready ({time.time() - t0:.1f}s); active adapters: {model.active_adapters}")

    conn = psycopg2.connect(load_db_url(args.target))
    conn.autocommit = False
    cur = conn.cursor()

    # Pre-flight: model + DB schema
    cur.execute("SELECT COUNT(*) FROM publication_embeddings WHERE model=%s", (MODEL_TAG,))
    n_existing = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM publications WHERE COALESCE(title,'') <> ''")
    n_eligible = cur.fetchone()[0]
    print(f"[setup] DB has {n_existing} existing embeddings ({MODEL_TAG}), "
          f"{n_eligible} eligible pubs total.")

    rows = fetch_targets(cur, limit=args.limit, all_=args.all, scope=args.scope)
    todo = []
    skipped = 0
    for r in rows:
        recompute, text, h = needs_recompute(r, force_all=args.all)
        if not recompute:
            skipped += 1
            continue
        todo.append((str(r[0]), text, h))
    # Length-bucketing: sort by text length so each batch has similar-length
    # texts. With dynamic padding (padding=True), this minimizes the padded
    # length per batch and gives 2-3x speedup over random order.
    todo.sort(key=lambda t: len(t[1]))
    print(f"[plan ] {len(todo)} pubs to embed; {skipped} unchanged & skipped. "
          f"Length bucketed for batching.")

    if not todo:
        print("[done ] nothing to do.")
        if not args.no_refresh:
            print("[done ] still calling refresh_embedding_pipeline so similarity stays consistent.")
            cur.execute("SELECT * FROM refresh_embedding_pipeline(%s)", (MODEL_TAG,))
            print("[done ] refresh:", cur.fetchall())
            conn.commit()
        cur.close(); conn.close()
        return 0

    # Process in batches
    n_total = len(todo)
    inserted = 0
    t_start = time.time()
    if args.max_pubs is not None:
        print(f"[plan ] --max-pubs={args.max_pubs} — will exit cleanly after that many embedded.")
    for batch_start in range(0, n_total, BATCH_SIZE):
        if args.max_pubs is not None and inserted >= args.max_pubs:
            print(f"[stop ] reached --max-pubs={args.max_pubs}, exiting for chunked restart.")
            break
        batch = todo[batch_start: batch_start + BATCH_SIZE]
        texts = [t for (_, t, _) in batch]
        embs = encode_batch(model, tokenizer, texts, device=device)

        # Bulk upsert via execute_values + ON CONFLICT.
        rows_for_db = [
            (pub_id, MODEL_TAG, vector_literal(v), h)
            for (pub_id, _, h), v in zip(batch, embs)
        ]
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO publication_embeddings
              (publication_id, model, embedding, computed_at, source_text_hash)
            VALUES %s
            ON CONFLICT (publication_id) DO UPDATE
              SET model = EXCLUDED.model,
                  embedding = EXCLUDED.embedding,
                  computed_at = EXCLUDED.computed_at,
                  source_text_hash = EXCLUDED.source_text_hash
            """,
            rows_for_db,
            template="(%s, %s, %s::vector, now(), %s)"
        )
        conn.commit()
        inserted += len(batch)
        # Free tensor memory aggressively — WSL2 OOM-Risiko per memory wsl2_oom_risk.md.
        del embs, rows_for_db
        if (batch_start // BATCH_SIZE) % 16 == 0:
            gc.collect()
        if (batch_start // BATCH_SIZE) % 5 == 0 or batch_start + BATCH_SIZE >= n_total:
            elapsed = time.time() - t_start
            rate = inserted / elapsed if elapsed > 0 else 0
            eta = (n_total - inserted) / rate if rate > 0 else 0
            print(f"[embed] {inserted}/{n_total} ({100*inserted/n_total:.1f}%)  "
                  f"rate={rate:.1f} pubs/s  eta={eta:.0f}s")

    print(f"[embed] done — {inserted} pubs in {time.time() - t_start:.1f}s")

    # Reindex ivfflat (recall improves substantially after data is present)
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
    print("[done ] all OK.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
