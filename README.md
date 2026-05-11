# StoryScout — Press Triage for Research Publications

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![Status](https://img.shields.io/badge/status-active-success)](#status)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](CONTRIBUTING.md)

Open-source web app helping research-institution press teams identify
their most pitchable publications — scored by an LLM across five
dimensions and ranked by semantic similarity to past press successes
via SPECTER2 embeddings.

> Built for the Austrian Academy of Sciences press office; open-sourced
> because every university press team has the same problem and nobody
> wants vendor lock-in.

![StoryScout — /review triage page](public/screenshots/review.png)
<!-- Screenshot placeholder; populated in Block 4 of the OSS-readiness plan. -->

## What it does

- **Triage queue** — undecided pubs ranked by `press_score` (LLM
  rubric) or by a combined rank-fusion of `press_score` and
  `press_similarity`, with per-pub Pitch / Hold / Skip + optional
  snooze and rationale
- **AI scoring** — LLM-driven rubric over five dimensions (Public
  Accessibility, Societal Relevance, Novelty, Storytelling Potential,
  Media Timeliness) plus a journalist-style pitch suggestion and a
  5-7-5 haiku rendering of the abstract
- **Semantic similarity** — SPECTER2 768-dim embeddings cluster new
  publications against historical press releases, surfacing the
  closest matches via a k-NN top-5 average cosine score

## Why it exists

The ÖAW press office evaluates ~7000 scientific publications per year
for press worthiness. Manual screening is the bottleneck. StoryScout
pre-sorts the candidates — the human decides, the machine filters.

Open source because every research-institution press team faces the
same problem, and nobody wants to be locked into a commercial vendor
for what is fundamentally a content-prioritization tool.

## Quick Start

### Prerequisites

- **Node.js ≥ 20** (LTS)
- **Supabase CLI** — `brew install supabase/tap/supabase` or
  `npm install -g supabase`
- **Docker** — for the local Supabase stack
- **Python 3.10+** — optional, only for the SPECTER2 embedding
  pipeline
- **OpenRouter API key** — for LLM scoring (free tier available)

### Setup (~5 minutes)

```bash
git clone https://github.com/mleihs/oeaw-press-relevance.git
cd oeaw-press-relevance
npm install

# Local Supabase stack (Postgres + Studio + Auth + Storage)
supabase start
supabase migration up --local

# Environment
cp .env.example .env.local
# Edit .env.local — minimum needed:
#   SUPABASE_URL=http://127.0.0.1:54421
#   SUPABASE_ANON_KEY=<from `supabase status`>
#   SUPABASE_SERVICE_ROLE_KEY=<from `supabase status`>
#   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54422/postgres
#   OPENROUTER_API_KEY=sk-or-...
#   GATE_PASSWORD=<your-choice>
#   GATE_TOKEN=<sha256 of GATE_PASSWORD>

npm run dev
```

Open <http://localhost:3000> and sign in with `GATE_PASSWORD`.

### Loading Data

Three options:

1. **Bring your own publications** — adapt
   `scripts/webdb-import.mjs` for your source CMS. The Postgres
   schema in `supabase/migrations/` is the contract; see
   [docs/WEBDB_IMPORT.md](docs/WEBDB_IMPORT.md).
2. **TYPO3 / WebDB MySQL dump** (the ÖAW path) — see the same
   doc for the field-mapping and DOI-fallback strategy.
3. **Sample dataset** — a small anonymized seed-data script is on
   the [roadmap](docs/ROADMAP.md); not yet shipped.

### Running the Embedding Pipeline (optional)

For press-similarity scoring (top-5 nearest historical press releases
per publication):

```bash
cd scripts/embeddings
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python compute-embeddings.py --target=local
```

The first real run downloads SPECTER2 (~440 MB) and takes ~90 minutes
on CPU. Subsequent runs hash-skip and complete in seconds.

### Deploy

**Vercel (default):**

```bash
npx vercel --prod
```

Set the same env vars in the Vercel project settings.

**Self-hosted** (universities without a Vercel account, or behind a
firewall): see [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) — Postgres
+ pgvector + systemd + nginx + Let's Encrypt.

## Pages Overview

| Page | What it shows |
|------|--------------|
| `/` | Dashboard — stats, top pubs, score distribution, dimensions radar, top keywords |
| `/review` | Triage queue — Pitch / Hold / Skip + Snooze, mobile bottom-sheet variant |
| `/publications` | Browse + filter + enrich + analyze |
| `/publications/[id]` | Detail — pitch, summaries, haiku, similar pressed pubs, decision toolbar |
| `/researchers` | Leaderboard — Spotlight Top-3 + ranked table + beeswarm distribution |
| `/persons/[id]` | Person profile — stats, activity chart, co-authors, publications |
| `/press-releases` | Press-release tracking — matched + orphan tabs |
| `/settings` | API keys, reviewer name, model selection |
| `/upload` | WebDB import instructions |

## Stack

| Layer | Tech | Notes |
|---|---|---|
| Framework | Next.js 16 App Router + React 19 + Turbopack | SSR + API routes + Vercel deploy defaults |
| UI | shadcn/ui + Radix UI + Tailwind v4 | Semantic-token theme system, dark-mode ready |
| State | TanStack Query + nuqs + localStorage | URL-bound filter state, server-state caching, no global store |
| Animation | motion / motion-number / d3-force | FLIP, animated counters, beeswarm collision |
| DB | Supabase Postgres + pgvector | Managed or self-hosted; 768-dim vectors |
| Embedding | SPECTER2 (`allenai/specter2_base` + proximity adapter) | Scientific-trained, free, runs offline |
| LLM | OpenRouter (Claude, GPT, DeepSeek, Llama, …) | BYOK, model-agnostic |
| Offline ML | Python + `transformers` + `adapters` + `psycopg2` | Standard SPECTER2 inference stack |
| Tests | Playwright (e2e + visual) + Vitest (unit, WIP) | 26 visual snapshots + 4 smoke tests |

Architecture rationale (why this stack, not Phoenix / FastAPI / Django
/ Rails / Go): [ARCHITECTURE.md § Tech-Stack Rationale](ARCHITECTURE.md#tech-stack-rationale).

## Score Dimensions

| Dimension | Weight | What it captures |
|-----------|--------|------------------|
| Public Accessibility | 20% | How easily non-experts can understand the result |
| Societal Relevance | 25% | Impact on health, environment, economy, public discourse |
| Novelty Factor | 20% | Breakthrough or surprising nature |
| Storytelling Potential | 20% | Narrative hooks a journalist could use |
| Media Timeliness | 15% | Connection to current public discourse |

These weights are hypothesis-driven, not data-fit. Empirical validation
(LR baseline, multicollinearity warnings, V2 formula recommendation):
[docs/SCORING_VALIDATION.md](docs/SCORING_VALIDATION.md).

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — domain model, data flow,
  design rationale, key abstractions
- [CONTRIBUTING.md](CONTRIBUTING.md) — dev setup, PR process, code
  conventions
- [docs/WEBDB_IMPORT.md](docs/WEBDB_IMPORT.md) — TYPO3 → Postgres
  ETL, adapting for other CMSs
- [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) — Postgres + nginx +
  systemd
- [docs/SCORING_VALIDATION.md](docs/SCORING_VALIDATION.md) — empirical
  analysis of the `press_score` formula
- [docs/MEMORY.md](docs/MEMORY.md) — decision log: "why X instead of Y"
- [docs/ROADMAP.md](docs/ROADMAP.md) — known limitations + planned
  work
- [OSS_READINESS_PLAN.md](OSS_READINESS_PLAN.md) — the live cleanup
  plan (Phase 1–4) toward production-grade OSS readiness

## Status

🟢 **Active development.** Used in production at the ÖAW press
office since 2026-04-30.

Roadmap and known limitations: [docs/ROADMAP.md](docs/ROADMAP.md).

## License

MIT — see [LICENSE](LICENSE). Use, fork, modify, redistribute freely.
By contributing you agree your contribution is MIT-licensed.

## Acknowledgements

- **SPECTER2 model** by the Allen Institute for AI
- **ÖAW Pressestelle** for the initial problem, funding, and ongoing
  dogfooding
- **OpenRouter** for the unified LLM API
- **Supabase** for the managed Postgres + open-source self-host
  option

## Citation

If you use StoryScout in research or institutional reporting, please
cite:

```bibtex
@software{storyscout2026,
  title  = {StoryScout: AI-Powered Press Triage for Research Publications},
  author = {Leihs, Matthias and contributors},
  year   = {2026},
  url    = {https://github.com/mleihs/oeaw-press-relevance}
}
```

## Contact

- GitHub Issues for bugs and feature requests
- Pull requests: see [CONTRIBUTING.md](CONTRIBUTING.md)
