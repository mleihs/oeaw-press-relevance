# Decision Log

A curated subset of design decisions made during StoryScout development
— the "why we did X instead of Y" record for future contributors.

> **Status:** stub. Full content lands in Phase 1 / Block 2 of
> [OSS_READINESS_PLAN.md](../OSS_READINESS_PLAN.md).

## Tech-Stack

**Why Next.js + Supabase, not Phoenix LiveView / FastAPI+React / Django**
- Phoenix LiveView would be architecturally ideal (Real-Time multi-user
  collab, OTP for long-running pipelines, less framework churn) — but
  4–8 weeks rewrite + Elixir learning curve + loss of shadcn/Radix
  ecosystem. Reconsider when: real-time-collab becomes a hard
  requirement, Vercel function-timeouts hurt, team grows beyond solo.
- FastAPI sidecar: rejected — embedding inference is offline batch, no
  ML hot-path; sidecar adds 2 deploys, 2 auth-stacks, +50–100ms latency.
- Django/Rails: same rewrite cost without LiveView-equivalent payoff.

**Why SPECTER2 (not mBERT / e5 / BGE)**
- Allen-AI off-the-shelf, scientific-trained on Semantic Scholar
- 768-dim sweet spot between quality and storage
- Limitation: English-only — see [ROADMAP.md](ROADMAP.md) for
  multilingual follow-up

## Data Model

**Why `webdb_uid` as natural key, not internal UUID**
- TYPO3 export is the source of truth — re-imports must be idempotent
- UUIDs are generated locally, but `webdb_uid` is the join-key for ETL

**Why `press_cluster_view` as single source of truth**
- Matched (publication_embeddings) UNION orphan
  (press_release_embeddings) — three RPCs would otherwise duplicate
  the UNION logic
- `DISTINCT ON publication_id` defensive against n:1
  press_release/publication (DE+EN variants)

## Production Practices

**Why local IS canonical (for analysis data)**
- Local Supabase is the analyst workstation; cluster centroid + k-NN
  refits happen there. Prod is rebuilt from local on demand
  (last rebuild 2026-04-30, both identical now).
- ETL non-destructive since 2026-04-30 (UPSERT/archive, no row-deletes).

**Why pooler URL for prod (not direct connection)**
- Supabase pooler at `aws-1-eu-west-3:5432` handles connection
  multiplexing for serverless Vercel functions
- Direct `db.<ref>.supabase.co:5432` would exhaust connections on a hot
  endpoint

## Scoring

**Why 5 LLM dimensions, not regression-fit**
- Original V1 was hypothesis-driven (Pressestelle's mental model)
- Empirical analysis (see [SCORING_VALIDATION.md](SCORING_VALIDATION.md))
  shows V2 weights would do better; V2 apply tracked in
  [ROADMAP.md](ROADMAP.md)
- The 5-dimension structure has secondary value as a per-pub
  explanation — even if weights are imperfect, the rubric tells the
  reviewer *why* a pub scored high

**Why k-NN top-5, not centroid cosine**
- ΔAP +0.049 in favor of k-NN under small-`n_pos` + topic-imbalance
- Centroid washes out signal in a multi-modal cluster

## Note

The full internal decision-log lives in private Claude-memory files
outside the repo. This document is the externalized subset relevant to
OSS contributors.
