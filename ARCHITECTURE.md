# Architecture

This document is for contributors. It explains the domain model, the
data flow through the application, the rationale for the major
technical decisions, and the key abstractions you'll encounter.

## Table of Contents

1. [Overview](#overview)
2. [Domain Model](#domain-model)
3. [Data Flow](#data-flow)
4. [Tech-Stack Rationale](#tech-stack-rationale)
5. [Folder Structure](#folder-structure)
6. [Key Abstractions](#key-abstractions)
7. [External Dependencies](#external-dependencies)
8. [Non-Goals](#non-goals)
9. [Performance Characteristics](#performance-characteristics)
10. [Open Architectural Questions](#open-architectural-questions)

## Overview

StoryScout is a Next.js App-Router web application backed by Postgres
(Supabase, with pgvector) and three offline workers:

- **WebDB ETL** — `scripts/webdb-import.mjs`, mirrors a TYPO3 MySQL
  source into Postgres on demand (nightly or manual)
- **Enrichment + Analysis** — Vercel SSE endpoints calling external
  APIs (CrossRef, OpenAlex, Unpaywall, Semantic Scholar) and LLMs (via
  OpenRouter) to score and pitch publications
- **SPECTER2 embedding pipeline** — `scripts/embeddings/compute-embeddings.py`,
  batch-embeds publications and orphan press-releases for k-NN
  similarity scoring

All three feed the same Postgres schema. The UI reads through TanStack
Query + the Supabase JS client.

## Domain Model

### Core Entities

```
                    ┌─────────────────┐
                    │  publications   │ ← TYPO3-WebDB-Mirror
                    ├─────────────────┤
                    │ id (UUID)       │
                    │ webdb_uid       │ ← natural key
                    │ title           │
                    │ abstract        │
                    │ enriched_abstract│ ← CrossRef/OpenAlex/Unpaywall
                    │ summary_de/_en  │ ← WebDB
                    │ press_score     │ ← LLM
                    │ press_similarity│ ← k-NN top-5 of pressed cluster
                    │ 5 LLM dims      │
                    │ pitch_suggestion│ ← LLM
                    │ haiku           │ ← LLM (5-7-5)
                    │ decision        │ ← undecided|pitch|hold|skip
                    │ snooze_until    │
                    │ flag_notes (jsonb)│
                    └────────┬────────┘
                             │
                  ┌──────────┴──────────┐
                  │                     │
        ┌─────────▼──────────┐  ┌──────▼────────┐
        │ publication_       │  │ press_releases │ ← matched + orphan
        │   embeddings       │  ├────────────────┤
        ├────────────────────┤  │ id (UUID)      │
        │ publication_id (PK)│  │ publication_id │ ← NULL = orphan
        │ model (TEXT)       │  │ doi            │ ← natural key
        │ embedding (vec 768)│  │ url, released_at│
        │ source_text_hash   │  │ paper_title    │
        │ computed_at        │  │ news_title     │
        └────────────────────┘  │ abstract       │
                                │ keywords       │
                                │ authors, lang  │
                                └────────┬───────┘
                                         │
                              ┌──────────▼──────────────┐
                              │ press_release_embeddings│ ← orphan only
                              ├─────────────────────────┤
                              │ press_release_id (PK)   │
                              │ embedding (vec 768)     │
                              └─────────────────────────┘

                              ┌─────────────────────────┐
                              │ press_cluster_view      │ ← SSOT for k-NN
                              ├─────────────────────────┤
                              │ kind: publication|orphan│
                              │ embedding               │
                              │ exclude_pub_id          │ ← self-exclusion
                              │ press_release_id, ...   │
                              └─────────────────────────┘
                              (Read by: refresh_press_cluster_centroid,
                                       refresh_press_similarity_knn,
                                       similar_pressed_pubs)
```

Side entities from the WebDB mirror: `persons`, `orgunits`, `extunits`,
`projects`, `lectures`, `oestat6_categories` (Austrian science
taxonomy, 1411 codes), `publication_types`, and the M:N junctions
`person_publications` / `orgunit_publications` / `publication_projects`.
Triage entity: `sessions` (one row per Friday-meeting-style review
session).

### Decision State Machine

```
undecided ──pitch──► pitch ──► (immutable until reset)
       ├──hold─────► hold (optional snooze_until)
       └──skip─────► skip
       └──reset────► undecided
```

Transitions are wired in
`app/api/publications/[id]/decision/route.ts`. Side effects: pitching
triggers a one-way MeisterTask push
(`lib/meistertask/push.ts`). `decided_at` is managed by the
`trg_publications_decided_at_sync` trigger.

### Embedding-Cluster Membership

The "press cluster" is the union of:

- **matched embeddings** — publications already linked to a press
  release (the canonical positive examples)
- **orphan embeddings** — press releases without a matching
  publication (about 28 at time of writing; covers the ~20% recall
  gap from imperfect DOI matching)

Surface: `press_cluster_view`. The view applies `DISTINCT ON
publication_id` defensively against future n:1 mappings (DE + EN
variants of the same release). All RPC functions read from the view,
never from the underlying tables.

## Data Flow

```
Step 1 — WebDB Import (manual or nightly cron)
  TYPO3 MySQL dump (~660 MB)
  └─► scripts/webdb-import.mjs
      • skips t3ver_*/mirror tables, deleted=1 rows
      • UPSERT pattern (non-destructive)
      • ~1 min for 37k publications + junctions
      └─► publications + persons + orgunits + projects + lectures + oestat6

Step 2 — Enrichment (manual via UI or batch endpoint)
  WHERE enrichment_status = 'pending'
  └─► /api/enrichment/batch (SSE)
      ↓
      CrossRef → enriched_abstract, journal, peer_reviewed, citations
      OpenAlex → open_access_status, oa_type, keywords
      Unpaywall → pdf_url, oa_color
      Semantic Scholar → enriched_abstract fallback
      PDF extraction → full_text_snippet
      └─► enrichment_status = 'enriched' | 'partial' | 'failed'

Step 3 — Orphan-Enrichment (press_releases without publication_id)
  └─► scripts/enrich-orphans.ts (or batch endpoint variant)
      ↓ Same APIs as Step 2, target = press_releases columns

Step 4 — LLM Analysis (manual via UI)
  WHERE analysis_status = 'pending' AND enrichment_status IN ('enriched','partial')
  └─► /api/analysis/batch (SSE)
      ↓ OpenRouter prompt + 5-dim rubric + pitch + haiku
      └─► publications.press_score, ..., pitch_suggestion, haiku

Step 5 — Embedding Compute (local, manual or cron)
  └─► scripts/embeddings/compute-embeddings.py --target=local
      ↓ SPECTER2 batch (Python, CPU)
      Pass 1: publications (hash-skip on cache hit)
      Pass 2: orphan press_releases
      └─► publication_embeddings + press_release_embeddings
      └─► refresh_embedding_pipeline RPC:
          - refresh_press_cluster_centroid (observability)
          - refresh_press_similarity_knn (k=5) materializes press_similarity

Step 6 — Embedding Push (local → prod)
  pg_dump --data-only -t publication_embeddings | psql "$PROD_URL"
  (orphan embeddings push via doi-natural-key — UUIDs differ per env)
  └─► prod refresh_embedding_pipeline fires

Step 7 — Triage (UI flow)
  /review ranks undecided pubs by press_score (default) or combined
  Reviewer clicks Pitch/Hold/Skip in DecisionToolbar
  └─► /api/publications/[id]/decision PATCH
      ├─► decision + decided_at + decided_by + decided_in_session
      ├─► lazy session-create if none active (ensureSessionId)
      └─► IF decision='pitch':
          └─► /api/meistertask/push → MeisterTask Create-Task API
              └─► meistertask_task_id + token (for deep-linking)
```

## Tech-Stack Rationale

### Why Next.js + Supabase

Picked for solo-dev velocity: shared TypeScript across client and
server, hosted Postgres with pgvector + auth + storage, Vercel deploy
defaults. SSR + API-Routes-as-controllers covers everything the app
needs without a separate backend service.

Trade-off accepted: Next.js conventions (`page.tsx` /
`'use client'` / file-based routes) feel implicit. The
[CONTRIBUTING.md](CONTRIBUTING.md) styling and folder rules try to
compensate; future phases (see
[OSS_READINESS_PLAN.md](OSS_READINESS_PLAN.md)) make this more explicit
via ESLint boundaries.

### Why SPECTER2 (not mBERT / e5 / BGE)

- Allen-AI off-the-shelf, scientific-trained on Semantic Scholar
  (~5M papers)
- 768-dim is a sweet spot between quality and storage cost
- The model adapter — `allenai/specter2` proximity adapter — is
  purpose-built for paper-paper similarity, which matches the
  press-cluster k-NN use case directly

Known limitation: SPECTER2 is English-only. ~8% of the ÖAW corpus is
German-only, and those pubs land in a noise subspace. Multilingual
embedding model as a parallel pipeline is tracked in
[docs/ROADMAP.md](docs/ROADMAP.md).

### Why no FastAPI sidecar

ML inference is offline batch (the Python script is a cron job, not a
hot-path service). All query-time DB calls go straight to Postgres. A
sidecar would add two deploys, two auth stacks, and 50–100 ms of
latency per request without solving any current problem.

### Why no Phoenix LiveView rewrite (yet)

LiveView would fit the app's "long-lived per-user session with
streaming updates" shape almost perfectly: Phoenix.Channels + Presence
for real-time multi-user triage, OTP supervisors for embedding
pipelines, less framework churn. The cost (4–8 weeks rewrite + Elixir
learning curve + loss of the shadcn / Radix ecosystem) is high enough
that a rewrite needs a triggering reason. Plausible triggers:

- Real-time multi-user triage becomes a hard requirement
- Vercel function timeouts become a recurring pain
- Team grows beyond solo and Elixir expertise joins

### Why no GraphQL

Single client + DB-near schema makes REST simpler. Type-safety arrives
in Phase 3 via Drizzle ORM, not GraphQL codegen. Supabase's auto
PostgREST already covers the GraphQL "introspectable schema"
property.

### Why TanStack Query (not SWR or raw fetch)

Cache invalidation patterns are built in, DevTools support is solid,
and contributors with React experience will recognize it. Wrapped in
`useApiQuery` (`lib/use-api-query.ts`) which injects auth headers — use
that, not raw `fetch`.

## Folder Structure

```
oeaw-press-relevance/
├── app/                       # Next.js App Router
│   ├── api/                   # REST + SSE endpoints
│   │   ├── auth/gate/         # Password gate
│   │   ├── analysis/batch/    # LLM streaming via OpenRouter (SSE)
│   │   ├── enrichment/batch/  # External enrichment (SSE)
│   │   ├── publications/      # CRUD + per-id sub-routes
│   │   ├── persons/[id]/      # Person profile data
│   │   ├── researchers/       # Top + distribution endpoints
│   │   ├── press-releases/    # Press-release CRUD
│   │   ├── review/queue/      # Triage queue with rank-fusion
│   │   ├── sessions/          # Session lifecycle
│   │   ├── meistertask/push/  # MeisterTask one-way push
│   │   ├── webdb/status/      # ETL state check
│   │   ├── orgunits/, oestat6/, publication-types/, export/
│   ├── publications/          # Browse + detail pages
│   ├── persons/[id]/          # Person profile pages
│   ├── researchers/           # Leaderboard + Beeswarm
│   ├── review/                # Triage queue
│   ├── press-releases/        # Orphan + matched tracking
│   ├── settings/, upload/
│   ├── globals.css            # Theme tokens
│   ├── layout.tsx, page.tsx
│   ├── error.tsx, loading.tsx, not-found.tsx, robots.ts
│   └── _components/
├── components/                # Reusable UI
│   ├── ui/                    # shadcn/ui primitives (do not edit)
│   ├── decision-badge.tsx     # DECISION_VARIANTS source of truth
│   ├── decision-toolbar.tsx
│   ├── publication-flag.tsx
│   ├── publication-table.tsx
│   ├── nav.tsx, theme-toggle.tsx
│   ├── tint-badge.tsx, section-label.tsx
│   ├── status-banner.tsx, api-error-card.tsx
│   ├── analysis-modal.tsx, enrichment-modal.tsx
│   ├── capybara-modal-avatar.tsx, capybara-logo.tsx
│   ├── info-bubble.tsx
│   ├── score-bar.tsx, similarity-indicator.tsx
│   ├── empty-state.tsx, loading-state.tsx, skeletons.tsx
│   ├── changelog-panel.tsx, password-gate.tsx
│   └── haiku-block.tsx, stat-card.tsx, atmospheric-orb.tsx
├── lib/                       # Shared helpers (server + client)
│   ├── api-helpers.ts         # Supabase client factory
│   ├── constants.ts           # SCORE_LABELS, LLM_MODELS, brand colors
│   ├── types.ts               # Domain types
│   ├── score-utils.ts, html-utils.ts, publication-display.ts
│   ├── settings-store.ts, session-store.ts
│   ├── use-api-query.ts       # TanStack Query wrapper
│   ├── use-keyboard-shortcuts.ts, use-info-bubbles.ts
│   ├── explanations.tsx       # EXPL map
│   ├── query-keys.ts
│   ├── meistertask/, enrichment/
│   ├── researchers.ts, changelog.ts
│   └── utils.ts
├── scripts/                   # Offline scripts
│   ├── embeddings/            # Python SPECTER2 batch
│   ├── webdb-import.mjs       # TYPO3 MySQL → Postgres
│   ├── enrich-orphans.ts      # External API enrichment for orphans
│   ├── session-pipeline.mjs   # Triage-session analytics
│   ├── recompute-press-scores.mjs
│   └── lib/                   # Shared script helpers
├── supabase/migrations/       # All schema changes, chronological
├── e2e/                       # Playwright (smoke + visual)
├── public/                    # Static assets
├── docs/                      # Internal docs and topic guides
└── README.md, ARCHITECTURE.md, CONTRIBUTING.md, LICENSE
```

Phase 2 of [OSS_READINESS_PLAN.md](OSS_READINESS_PLAN.md) splits
`lib/` into `lib/server/`, `lib/shared/`, `lib/client/` with
ESLint-enforced import boundaries.

## Key Abstractions

### `DECISION_VARIANTS` (components/decision-badge.tsx:21)

Single source of truth for decision-state visuals. Every surface
(badge, toolbar button, flag icon) reads its icon, label, accent
border, and three styling slots (badge pill, large button, icon
button) from this object.

To add a new decision state:

1. Add an entry to `DECISION_VARIANTS`
2. Update the `Decision` type in `lib/types.ts`
3. Update the DB enum in a new migration

Every surface picks the new state up automatically — no Tailwind
class drift between badge and button.

### `press_cluster_view` (supabase/migrations/20260511000001…)

Single source of truth for "what's in the press cluster". A
`UNION ALL` of matched `publication_embeddings` and orphan
`press_release_embeddings`, with `DISTINCT ON publication_id`
defensively against future n:1 mappings.

All three RPC functions read from this view:

- `refresh_press_cluster_centroid(model)`
- `refresh_press_similarity_knn(model, k)`
- `similar_pressed_pubs(pub_id, model, limit)`

Never query the underlying tables directly — the view is the contract.

### `EmbedTarget` (scripts/embeddings/compute-embeddings.py)

Pure-data dataclass with four fields: `source_id`, `text`,
`source_hash`, `old_hash`. Unifies publication rows and orphan
press-release rows so the batch-embed code is identical regardless of
source. The `process_pass` function takes a target table name + id
column name explicitly, making mixed-source bugs a structural
impossibility.

### Theme Tokens (app/globals.css)

Tailwind v4 `@theme inline` with CSS vars per light/dark mode. Custom
extension: `--chart-bucket-1` through `--chart-bucket-10` for the
score-distribution chart, exposed via `@theme inline` so Tailwind
arbitrary-value classes (`bg-[var(--chart-bucket-3)]`) work.

**Convention:** always use semantic tokens (`bg-card`,
`text-muted-foreground`, `border-border`) — never hardcoded neutrals
(`bg-white`, `text-neutral-500`). See
[CONTRIBUTING.md#styling](CONTRIBUTING.md#styling) for the full
mapping table.

### EXPL Map (lib/explanations.tsx:28)

ID-keyed dictionary of `Explanation` objects with shape
`{ title, body, formula?, example?, note? }`. `<InfoBubble id="...">`
components reference entries by ID. Adding a new metric or term:
add an entry to `EXPL`, then reference it via the ID.

### `useApiQuery` (lib/use-api-query.ts:28)

Wrapper around TanStack Query that injects auth headers. Use this —
never raw `fetch` — for any DB-backed query in components.

### Query Keys (lib/query-keys.ts:14)

Centralized cache-key constants (`QK.publications`,
`QK.publication(id)`, `QK.reviewQueue`, etc.). Invalidate after
mutations via:

```ts
queryClient.invalidateQueries({ queryKey: QK.publications });
```

### Trigger System (Postgres)

- `trg_press_releases_refresh_embedding` — STATEMENT-level, fires on
  press_release insert / update / delete
- `press_releases_promote_drop_orphan_embedding` — ROW-level, drops
  the orphan embedding when an orphan press_release gets a
  `publication_id` (i.e. gets promoted to matched)
- `trg_publications_decided_at_sync` — auto-manages `decided_at` on
  decision changes

In Postgres, ROW triggers fire before STATEMENT triggers on the same
statement.

### RPCs (Postgres functions)

| Function | Volatility | Notes |
|---|---|---|
| `refresh_press_cluster_centroid(model)` | VOLATILE | Returns observability counts |
| `refresh_press_similarity_knn(model, k)` | VOLATILE | Materializes `press_similarity` |
| `refresh_embedding_pipeline(model)` | VOLATILE | Wraps the two above |
| `similar_pressed_pubs(pub_id, model, limit)` | STABLE | Function-attribute `SET ivfflat.probes TO 50` — `SET LOCAL` inside body would be rejected for STABLE functions |
| `promote_press_release_orphans()` | VOLATILE | Links orphan press_releases to newly imported pubs |
| `publication_with_relations(pub_id)` | STABLE | Eager-fetch with joins |

### Password Gate (`/api/auth/gate`, `proxy.ts`)

`GATE_PASSWORD` (plaintext, env-only) + `GATE_TOKEN` (sha256 of the
same, env-only) are compared on submit. On success the server sets an
httpOnly cookie; the client stores a sessionStorage marker so the
gate UI doesn't flash on subsequent loads. This is anti-bot, not an
ACL — the app trusts everyone past the gate.

## External Dependencies

### Source APIs (read-only)

| API | Purpose | Notes |
|---|---|---|
| **CrossRef** | DOI metadata, abstracts, citations | Polite-pool friendly with `mailto` param |
| **OpenAlex** | Open scholarly metadata, ~250M works | 100k/day free, no key required |
| **Unpaywall** | OA status, PDF URLs | 100k/day free, email param |
| **Semantic Scholar** | Citation graph, paper enrichment | 100 req / 5 min free; key optional |

### Sink APIs

| API | Purpose | Auth |
|---|---|---|
| **OpenRouter** | LLM access (Claude, GPT, DeepSeek, …) | BYOK (your own key) |
| **MeisterTask** | One-way push on `decision = pitch` | Personal Access Token |

### Data Storage

- **Postgres** via Supabase (managed) or self-hosted
- **pgvector** for 768-dim cosine similarity
- **IVFFlat index** with `lists = 50`; `probes = 50` is forced via
  function-attribute on the read RPCs (~1% recall improvement vs
  `probes = 1`)
- Local Supabase via Docker; ports `544xx` to coexist with other
  local Supabase projects

### Models

- **SPECTER2** (`allenai/specter2_base` + `allenai/specter2` proximity
  adapter), ~440 MB, downloaded once on first script run, cached
  locally

## Non-Goals

What StoryScout is **not**:

- Not a full publication manager — source-of-truth metadata is
  edited in the originating CMS (WebDB / TYPO3 for ÖAW), this app
  mirrors it read-only and adds analysis layers on top
- Not a press-release authoring tool — triage and ranking only
- Not real-time multi-user collaborative — no live cursors, no chat,
  no shared selection state
- Not a full auth system — the password gate is anti-bot, not an ACL.
  Everyone past the gate has full read/write
- No hot-path ML — embedding inference is offline batch
- Not a citation analysis tool — citation counts inform the score
  but the app doesn't surface citation graphs

## Performance Characteristics

| Operation | Cost | Notes |
|---|---|---|
| `/review` initial render | ~22 s | Queue API fetches 38k pubs + ranking |
| Embedding compute (cold) | ~3.2 s / pub | CPU, includes model load amortized |
| Embedding compute (hash hit) | sub-second | No-op when source-hash matches |
| `press_similarity` refresh | ~26 s | n = 7375, k = 5, IVFFlat probes = 50 |
| WebDB import | ~1 min | 37k publications + junctions |
| SSE per pub (enrichment) | 500 ms – 2 s | Network-bound (CrossRef / OpenAlex / etc.) |
| Playwright `visual.spec.ts` | ~4 min | 26 snapshots, light + dark |

## Open Architectural Questions

### `press_release` n:1 publication

The schema allows multiple press_releases per pub (DE + EN variants
of the same release). The data is 1:1 in production; the view applies
`DISTINCT ON publication_id` defensively. If n:1 becomes real, UI
logic for variant selection (which one to surface, which to hide) is
needed.

### German pubs + SPECTER2

~8% of the corpus is German-only. English-trained SPECTER2 produces
an "embedding collapse" — DE-only pubs cluster in a noise subspace,
their similarity to the (mostly English) press cluster is
unreliable. Current mitigation: the UI hints "press cluster is mostly
English" near the similarity card. Future: multilingual-e5-large or
BGE-M3 as a parallel pipeline. See
[docs/ROADMAP.md](docs/ROADMAP.md).

### `press_score` formula refit

The current weighting (Public Accessibility 20% / Societal Relevance
25% / Novelty 20% / Storytelling 20% / Media Timeliness 15%) is
hypothesis-driven, not data-fit. Empirical validation
([docs/SCORING_VALIDATION.md](docs/SCORING_VALIDATION.md)) shows:

- `societal_relevance` ≈ 0 effective signal
- `novelty` + `storytelling_potential` carry ~75% of the variance
- LR fit on the 5 dimensions outperforms hand-tuned weights
  (AP 0.114 vs 0.088)

V2 weights are recommended; not yet shipped.

### Vercel function timeout

SSE streams break at 60 s on Vercel Pro. For >250-pub batches the
client chunks calls. A proper job queue (Inngest, Trigger.dev) is
tracked in the roadmap; it would also remove the
client-disconnect-cancels-the-job fragility.

### Recharts theming

Chart colors are partially theme-aware (via `useTheme` in
`activity-chart.tsx`, stroke classes in `beeswarm-view.tsx`). Some
inline SVG strokes / fills are still hardcoded `#hex`. Roadmap:
full `currentColor` + CSS-var migration so dark/light themes work
without re-rendering charts.
