# OSS Readiness Plan — „Weg C"

**Stand:** 2026-05-11
**Status:** Plan, Phase 1 noch nicht begonnen
**Autor:** Session-Outcome zwischen mleihs + Claude Opus 4.7 (1M context)

Dieser Plan ist die vollständige Roadmap, das aktuelle Tool für
**Open-Source-Release an PR-Teams anderer Universitäten** in einen sauberen,
beitragsfreundlichen Zustand zu bringen — ohne Stack-Rewrite.

> **Wenn Du dieses Dokument nach `/clear` liest:** spring zu §11 „Wie hier
> nach /clear weitermachen". Alle Entscheidungen, alle Kontexte, alle
> bisherigen Schritte sind hier festgehalten — der Plan ist self-contained.

---

## Inhaltsverzeichnis

1. [Kontext & Rationale](#1-kontext--rationale)
2. [Bereits erledigt vor diesem Plan](#2-bereits-erledigt-vor-diesem-plan)
3. [Aktueller Codebase-Zustand (Inventory)](#3-aktueller-codebase-zustand-inventory)
4. [Phasen-Übersicht](#4-phasen-übersicht)
5. [Phase 1 — Foundation Docs (im Detail)](#5-phase-1--foundation-docs-im-detail)
6. [Phase 2 — Folder-Reorg + Business-Logic-Extraction](#6-phase-2--folder-reorg--business-logic-extraction)
7. [Phase 3 — Drizzle ORM Migration](#7-phase-3--drizzle-orm-migration)
8. [Phase 4 — Test-Coverage](#8-phase-4--test-coverage)
9. [Cross-Cutting Concerns](#9-cross-cutting-concerns)
10. [Memory-Files Referenz (~/.claude/...)](#10-memory-files-referenz)
11. [Wie hier nach /clear weitermachen](#11-wie-hier-nach-clear-weitermachen)
12. [Open Questions](#12-open-questions)

---

## 1. Kontext & Rationale

### 1.1 Was passieren soll
Die App `oeaw-press-relevance` (interner Code-Name: **StoryScout**) ist
ein Triage-Tool der ÖAW-Pressestelle für die KI-gestützte Bewertung
wissenschaftlicher Publikationen auf Press-Eignung. Sie soll Open-Source
verfügbar gemacht werden, damit PR-Teams anderer
Universitäten/Forschungseinrichtungen sie selbst hosten und nutzen können.

### 1.2 Warum „Aufräumen" statt „Rewrite"
Diskutiert wurden mehrere Stack-Alternativen:

- **Phoenix LiveView (Elixir)** wäre architektonisch ideal für genau diesen
  App-Typ — Single-Binary-Deploy, Real-Time-Multi-User-Collab als
  Free-Feature (Phoenix.Channels + Presence), OTP-Supervisors für die
  lang-laufenden Enrichment- und Analyse-Pipelines, kleinere
  Framework-Churn-Gefahr (Phoenix seit 2014 stabil vs Next.js mit
  Pages→App-Router-Pivot). Rewrite würde 4-8 Wochen ernsthafte Arbeit +
  Elixir-Lernkurve + shadcn/Radix-Ecosystem-Verlust kosten.
  **Schwelle für späteren Rewrite-Trigger:** wenn Real-Time-Multi-User-
  Collab Feature wird ODER Vercel-Function-Timeouts regelmäßiger Schmerz
  werden ODER Solo-Dev-Phase endet und Elixir-Team-Expertise dazukommt.

- **FastAPI + React** (Backend-Frontend-Split) abgelehnt — verdoppelt
  Ops-Komplexität (2 Deploys, 2 Auth-Stacks, +50-100ms Latency per
  Request) ohne ML-Hot-Path-Bedarf (Embedding-Inferenz ist offline-Batch).

- **Django + HTMX + Alpine** — solide Alternative, jede Uni-IT kennt
  Python+Django, aber gleicher Rewrite-Aufwand wie Phoenix bei weniger
  spezifischem Nutzen (kein LiveView-Äquivalent).

- **Rails 7 + Hotwire** — OG „clean conventions", aber Ruby in Academia
  rarer als Python/JavaScript.

- **Go + Templ + HTMX** — Single Binary, simple Deploy, aber Framework-
  Story dünner.

**Entscheidung: Weg C** — aktueller Next.js + Supabase-Stack bleibt, wird
aber für OSS-Quality so aufgeräumt, dass die berühmten „Schlampig-
Eindrücke" von Next.js durch klare Konventionen kompensiert werden.

### 1.3 Was am Next.js-Stack legitim „schlampig" wirkt
Diese Schmerzpunkte werden in Phase 2-4 adressiert (durch Konventionen +
Tooling), nicht eliminiert (das ginge nur via Rewrite):

| Symptom | Mitigation in Weg C |
|---|---|
| Magic-File-Conventions (`page.tsx`, `layout.tsx`, `route.ts`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `middleware.ts`) | ARCHITECTURE.md dokumentiert pro File-Type was passiert; ESLint-Boundaries-Plugin (Phase 2) macht Server/Client-Confusion früher sichtbar |
| `'use client'` ist ein String, Server-only-Code in Client-Component erst zur Runtime sichtbar | Phase 2: striktere Import-Boundaries via ESLint `eslint-plugin-boundaries` — Server-Logic in `lib/server/` darf nicht von Client-Components importiert werden |
| App-Router war Pages-Router-Replacement, Next.js 17/18 könnten wieder paradigmenwechseln | Mitigation: Pure-Function-Business-Logic in `lib/server/` ist Next.js-agnostisch und überlebt Framework-Pivots |
| Caching-Mechanismen (`revalidate`, `dynamic`, `force-static`, fetch-cache, ISR) überlappen | ARCHITECTURE.md: explizite Caching-Strategie pro Route dokumentiert |
| Edge vs Node Runtime ist pro Route unklar | Per-Route-Header-Kommentar oder File-Konvention |
| API-Routes sind dünner Layer neben Pages, kein „Backend" | Phase 2: API-Routes werden auf ≤50 LOC reduziert, sind nur HTTP-Adapter — echtes Backend lebt in `lib/server/` |
| Vercel-Coupling für Image-Opt, Edge-Functions, ISR | CONTRIBUTING.md dokumentiert Self-Hosting-Path (Docker, Node-Server, separates Postgres) |

### 1.4 Memory-Files-Hintergrund

Die Session hat über Wochen umfangreichen Kontext aufgebaut in
Memory-Files (Pfad: `~/.claude/projects/-home-mleihs-dev-oeaw-press-release/memory/`).
Vollständige Liste in §10. Wichtigste für diesen Plan:

- **`production_db_safety.md`** — Local IS canonical für Analyse-Daten.
  ETL ist seit 2026-04-30 non-destructive (UPSERT/archive). Prod wurde am
  2026-04-30 from local rebuilt, beide sind identisch.
- **`prod_deployment_setup.md`** — Pooler URL eu-west-3, docker-exec
  pg_dump-Pattern, BYOK OpenRouter, canonical-URL umgeht Vercel-SSO.
- **`wsl2_oom_risk.md`** — dev server + enrich-api parallel killt Node;
  heap-cap 1.5 GB nötig, watch swap, expect 3-loop cycle.
- **`dark_mode_token_conventions.md`** — etablierte Mapping-Tabelle nach
  Full-Repo-Sweep 2026-05-10; bei neuen Components NIE wieder hardcoded
  `text-neutral-*`/`bg-white`.
- **`user_preferences.md`** — German-first, opinionated stack picks,
  ultrathink, apply-cadence (Block statt File).
- **`feedback_apply_pacing.md`** — Plan-OK = Implementation am Stück,
  Status pro Block, nicht pro File-Schreibvorgang.
- **`press_score_alignment_finding.md`** — CV-AUC 0.85, AP 0.088 vs LR
  5-dim 0.114; novelty+storytelling tragen ~75%, societal_relevance ≈ 0;
  V2-Formel empfohlen aber noch nicht apply.
- **`centroid_vs_knn_lesson.md`** — bei kleinem n_pos+Topic-Imbalance ist
  k-NN avg Top-5 deutlich besser als Centroid-Cosine; ΔAP +0.049 empirisch.

---

## 2. Bereits erledigt vor diesem Plan

Dies ist der **Einstiegszustand** der Repository. Wenn Du nach /clear
weitermachst, ist dieser Zustand der Ausgangspunkt.

### 2.1 Letzte Commits dieser Session (2026-05-10/11)

```
0c3acae fix(embeddings): defensive NaN/Inf check in encode_batch
a03b016 fix: press_cluster_view DISTINCT ON pub_id + smoke timeout 15→25s
737718b feat(press-release): orphan press_release embeddings in k-NN-Cluster
0603ba0 fix(press-release): ivfflat-probes=50 in k-NN-Similarity-Funktionen
e9662cf feat(settings): Identitäts-Card aktiviert reviewerName-UI
cabfaaf docs(press-release): handover-Eintrag V2 + Embedding-Pipeline (2026-05-09)
64df90c feat(press-release): Press-Reference-Card auf Detail-Page + /review combined-rank
e15fe12 feat(press-release): SPECTER2-Embedding-Pipeline + k-NN press_similarity
```

### 2.2 Major Outcomes der letzten Sessions (chronologisch)

**Token-Sweep + Component-Library (commits leading to dark-mode-ready):**
- Dark-Mode Token-Sweep über 50+ Files mit semantic Tokens (siehe
  Memory `dark_mode_token_conventions.md`)
- Extracted Components in `components/`:
  - `TintBadge` (color tints mit dark mode, types: green|amber|blue|red|purple|indigo|emerald|orange)
  - `SectionLabel` (h4 mit semantic styling, twMerge-override-friendly)
  - `StatusBanner` (success|warning|info|error|neutral variants, inline alerts)
  - `ApiErrorCard` (error display mit title/message/hint)
  - `CapybaraModalAvatar` (variant: analyst|enricher, ~120 LOC Dedup zwischen Modals)
- `@keyframes capybara-*` aus Modal-`<style jsx global>` nach `globals.css` zentralisiert
- BUCKET_COLORS via CSS-Vars (Variante B): `--chart-bucket-1..10` mit
  light+dark-Werten in `:root` und `.dark`, exposed via `@theme inline`
- Mobile-Sheet auf /review (Variante 1: outer `<Link>` mit
  `onClick e.preventDefault() + setSheetOpen(true)` wenn `inSession=true`)
- TAB_DEFS-Konsolidierung in `press-releases/page.tsx` mit
  `as const satisfies` + derived `Tab` type
- Issue 1 (Mobile Bottom-Sheet) + Issue 2 (Token-Sweep) + Issue 3
  (TAB_DEFS) aus `oeaw-press-release-docs/CLEANUP_FOLLOWUPS_2026-05-10.md`
  erledigt

**Playwright Test-Infrastruktur:**
- `e2e/visual.spec.ts` mit 26 Snapshots (light+dark für 8 statische Routes
  + 2 dynamische detail-pages + 6 interactive states)
- `e2e/review-smoke.spec.ts` mit 4 smoke tests (Nav, /review render,
  Decision-Toolbar, Detail-Page Decision-Toolbar)
- playwright.config.ts: `timeout: 60_000, retries: 1`
- Smoke-Test-Timeout für /review 15→25s (commit a03b016)

**Orphan-Embedding-Feature (commits 737718b, a03b016, 0c3acae):**
- Schließt die ~20%-Lücke im Press-Cluster: 28 Orphan-press_releases
  (gepresste Papers ohne WebDB-Match) sind jetzt im k-NN-Cluster
- Migration `20260511000001_orphan_press_release_embeddings.sql`:
  - Neue Tabelle `press_release_embeddings` (symmetric to publication_embeddings)
  - Cleanup-Trigger `press_releases_promote_drop_orphan_embedding` (orphan→matched promotion dropt orphan embedding row)
  - `press_cluster_view` (Single-Source-of-Truth UNION matched+orphan)
  - `refresh_press_cluster_centroid` + `refresh_press_similarity_knn` + `similar_pressed_pubs` lesen ALLE aus dem View
- Migration `20260511000002_press_cluster_view_distinct_on.sql`:
  - DISTINCT ON publication_id im matched-Leg (defensive gegen n:1 DE+EN press_release-Varianten)
- Compute-Embeddings.py refactored:
  - `EmbedTarget` als pure-data dataclass (4 fields: source_id, text, source_hash, old_hash)
  - `_rows_to_targets` Helper (shared zwischen 2 fetchers)
  - `process_pass` mit explicit `target_table`/`id_column` args (strukturell sicher gegen Mixed-Source-Bugs)
  - Defensive NaN/Inf-Check in `encode_batch` (pgvector würde sonst silent rejecten mit cryptic Error)
  - `--skip-orphans` Flag für chunked-restart-Pattern
- PressReferenceCard:
  - Discriminated union `SimilarPressed` (kind=publication ⟹ publication_id non-null)
  - Orphan-Routing zu `press_release.url` mit `target=_blank` + `<ExternalLink>` icon
  - DE/EN-Sprach-Hinweis zahlenunabhängig
- Prod-Rollout:
  - Migration via psql applied
  - 28 orphan-embeddings von lokal nach prod via doi-natural-key gepushed
    (UUIDs sind pro-env unique, doi nicht — pg_dump --data-only ging
    nicht wegen FK-Mismatch)
  - refresh_embedding_pipeline auf prod: centroid_n 142, similarity_updated 5173

**Misc-Cleanup:**
- LICENSE MIT created (commit pending nach diesem Plan)
- `OSS_READINESS_PLAN.md` (dieses File)
- Memory-Files für dark-mode-tokens + (geplant) press_release_embeddings

### 2.3 Aktueller DB-State (lokal + prod identisch nach Sync)

**Lokal:**
- 38.559 publications eligible (mit non-empty title)
- 7.375 publication_embeddings (analyzed cohort)
- 28 press_release_embeddings (orphan subset)
- 142 cluster_centroid n_samples
- 7.375 publications mit press_similarity != NULL

**Prod:**
- 7.362 publication_embeddings (13 Pubs Unterschied — neuer auf lokal noch nicht synced)
- 28 press_release_embeddings (synced 2026-05-11)
- 142 cluster_centroid n_samples
- 7.362 publications mit press_similarity != NULL

---

## 3. Aktueller Codebase-Zustand (Inventory)

### 3.1 Folder-Structure (heute)

```
oeaw-press-relevance/
├── app/                          # Next.js App Router
│   ├── api/                      # API endpoints (REST + SSE)
│   │   ├── auth/gate/            # Password gate (sessionStorage + httpOnly cookie)
│   │   ├── analysis/batch/       # LLM-streaming via OpenRouter (SSE)
│   │   ├── enrichment/batch/     # CrossRef/OpenAlex/Unpaywall/S2 (SSE)
│   │   ├── publications/         # CRUD + per-id sub-routes (decision, flag, similar-pressed)
│   │   ├── persons/[id]/         # Person profile data
│   │   ├── researchers/          # Top + distribution endpoints
│   │   ├── press-releases/       # Press-release CRUD + stats
│   │   ├── review/queue/         # Triage-queue rank-fusion
│   │   ├── sessions/             # Session lifecycle
│   │   ├── meistertask/push/     # External API push
│   │   ├── webdb/status/         # ETL state check
│   │   ├── export/[format]/      # CSV/JSON export
│   │   └── info-bubbles/[id]/    # InfoBubble dynamic content
│   ├── publications/             # Browse + detail pages
│   │   ├── [id]/                 # Publication detail
│   │   │   ├── _components/      # Detail-page-specific components
│   │   │   └── page.tsx
│   │   ├── _components/          # Browse-page-specific (filter-sheet, preset-bar, etc.)
│   │   ├── _filters.ts           # Filter state types
│   │   └── page.tsx
│   ├── persons/[id]/             # Person profile pages
│   │   └── _components/          # activity-chart, coauthor-block, person-header, pub-list
│   ├── researchers/              # Leaderboard + Beeswarm
│   │   ├── _components/          # spotlight-podium, leaderboard-table, beeswarm-view, etc.
│   │   ├── _filters.ts
│   │   └── page.tsx
│   ├── review/page.tsx           # Triage queue
│   ├── press-releases/page.tsx   # Orphan + matched tracking
│   ├── settings/page.tsx         # Config
│   ├── upload/page.tsx           # WebDB import docs
│   ├── globals.css               # Theme tokens (CSS vars für dark/light + chart-buckets)
│   ├── layout.tsx                # Root layout (ThemeProvider, password-gate, fonts)
│   ├── page.tsx                  # Dashboard
│   ├── not-found.tsx, error.tsx  # Error boundaries
│   └── ...
├── components/                   # Reusable UI components
│   ├── ui/                       # shadcn/ui primitives (auto-generated, do not touch)
│   ├── decision-badge.tsx        # DECISION_VARIANTS single-source-of-truth
│   ├── decision-toolbar.tsx      # Pitch/Hold/Skip + Snooze + Rationale
│   ├── publication-flag.tsx      # Pin-flag mit notes
│   ├── publication-table.tsx     # Desktop table + MobilePublicationCard
│   ├── nav.tsx                   # Top nav with brand-bg
│   ├── theme-toggle.tsx          # next-themes integration
│   ├── tint-badge.tsx            # NEW — color-tinted Badge wrapper
│   ├── section-label.tsx         # NEW — h4 mit text-xs/uppercase/muted-foreground
│   ├── status-banner.tsx         # NEW — inline alerts mit variant prop
│   ├── api-error-card.tsx        # NEW — error display
│   ├── capybara-modal-avatar.tsx # NEW — modal capybara mit variant prop
│   ├── analysis-modal.tsx        # SSE-streaming LLM analysis
│   ├── enrichment-modal.tsx      # SSE-streaming external-API enrichment
│   ├── info-bubble.tsx           # Hover/click Popover mit EXPL map
│   ├── score-bar.tsx             # PressScoreBadge + ScoreBar dimensions
│   ├── empty-state.tsx           # Reusable empty card
│   ├── loading-state.tsx         # Spinner variants
│   ├── changelog-panel.tsx       # „Was ist neu" dropdown
│   ├── password-gate.tsx         # Initial auth UI
│   ├── haiku-block.tsx           # 5-7-5 Haiku rendering mit fade-in
│   ├── similarity-indicator.tsx  # Press-Similarity 3-band pill
│   ├── stat-card.tsx             # Dashboard stat counter
│   ├── atmospheric-orb.tsx       # Decorative gradient blob
│   ├── capybara-logo.tsx         # Logo + Empty-state Capybara
│   ├── skeletons.tsx             # Loading skeleton variants
│   ├── sse-progress.tsx          # Legacy SSE-progress UI (largely replaced by modals)
│   └── ...
├── lib/                          # Shared utilities (app + scripts)
│   ├── api-helpers.ts            # supabase client factory aus Cookie/Header
│   ├── constants.ts              # SCORE_LABELS, SCORE_COLORS, LLM_MODELS, brand colors
│   ├── types.ts                  # Domain types: Publication, PressRelease, Decision, FlagNote, etc.
│   ├── score-utils.ts            # getScoreBandClass, getScoreBandStoryLabel
│   ├── html-utils.ts             # displayTitle (handles WebDB-truncation-at-colon)
│   ├── publication-display.ts    # displayAuthor, displayInstitute
│   ├── settings-store.ts         # localStorage-backed settings (reviewerName etc.)
│   ├── session-store.ts          # current session ID in localStorage
│   ├── use-api-query.ts          # Wrapper um TanStack Query mit auth-headers
│   ├── use-keyboard-shortcuts.ts # /, ⌘K, ↑↓ etc.
│   ├── use-info-bubbles.ts       # Global bubble-toggle via storage event
│   ├── explanations.tsx          # EXPL map: id → {title, formula?, body, example?, note?}
│   ├── meistertask/              # MeisterTask push logic + URL helpers
│   ├── enrichment/               # DOI-utils, language-detection
│   ├── researchers.ts            # Leaderboard/Distribution types + helpers
│   ├── changelog.ts              # Static changelog entries
│   ├── query-keys.ts             # TanStack Query keys central
│   └── utils.ts                  # cn() via twMerge
├── scripts/                      # Offline scripts
│   ├── embeddings/               # Python (SPECTER2 batch)
│   │   ├── compute-embeddings.py # Main embedding pipeline (refactored)
│   │   ├── run-chunked.sh        # WSL2 OOM workaround (chunked restarts)
│   │   ├── requirements.txt      # transformers, adapters, torch, psycopg2, numpy
│   │   └── .venv/                # Python virtualenv (gitignored)
│   ├── webdb-import.mjs          # Nightly TYPO3 MySQL → Postgres sync
│   ├── enrich-orphans.ts         # External-API enrichment für orphan press_releases
│   ├── session-pipeline.mjs      # Triage-session analytics
│   ├── recompute-press-scores.mjs # Bulk press_score refit (V2 formula)
│   └── lib/                      # Shared script helpers (doi-extract, etc.)
├── supabase/
│   └── migrations/               # All schema changes — versioned + applied
│       ├── ...                   # Many earlier migrations für base schema
│       ├── 20260509000007_embedding_similarity.sql    # SPECTER2 infra
│       ├── 20260511000001_orphan_press_release_embeddings.sql # Orphan embeddings
│       └── 20260511000002_press_cluster_view_distinct_on.sql  # n:1 defensive
├── e2e/
│   ├── global-setup.ts           # Password-gate login + storage state
│   ├── review-smoke.spec.ts      # 4 smoke tests
│   └── visual.spec.ts            # 26 visual snapshots
├── public/                       # Static assets (logos, capybara-gate.png)
├── HANDOVER.md                   # Working session-state log
├── TECH_HANDOVER.md              # Tech-architecture handover doc
├── IMPLEMENTATION.md             # Implementation notes per feature
├── PROD_SETUP_PLAN.md            # Production deployment plan
├── TRIAGE_LOOP_PLAN.md           # Triage UX plan
├── RESEARCHERS_PLAN.md           # Researchers-page plan
├── BEWERTUNGS_RUBRIK.md          # Scoring rubric (German)
├── README.md                     # Current (4KB, will be rewritten Phase 1)
├── LICENSE                       # MIT (created Phase 0)
├── OSS_READINESS_PLAN.md         # THIS FILE
├── package.json, tsconfig.json, eslint.config.mjs, playwright.config.ts
├── next.config.ts, postcss.config.mjs
└── .env.local                    # gitignored
```

### 3.2 Tech-Stack im Detail

**Frontend:**
- **Next.js 16** App Router, TypeScript strict mode, Turbopack
- **React 19** (Server Components + Client Components)
- **Tailwind CSS v4** mit `@theme inline` für CSS-Vars
- **shadcn/ui** auf **Radix UI** Primitives (Popover, Dialog, Sheet, etc.)
- **next-themes** für Light/Dark Toggle (system + manual override)
- **motion / motion-number** für FLIP animations + animated counters
- **d3-force** für Beeswarm collision-Layout
- **Recharts** für BarChart, Radar
- **nuqs** für URL-bound filter state
- **PapaParse** für client-side CSV parsing
- **TanStack Query** (via `useApiQuery` wrapper) für caching
- **sonner** für toast notifications

**Backend (Next.js API routes):**
- **Supabase JS Client** für DB + Auth + RPC + Storage
- **OpenRouter** API für LLM streaming (Anthropic, DeepSeek, etc.)
- **pdfjs-dist** für PDF-text-extraction (enrichment)
- **AbortController** für SSE-stream cancellation
- **httpOnly Cookie** + sessionStorage marker für password gate

**DB:**
- **PostgreSQL** via Supabase
- **pgvector** Extension für 768-dim Embedding cosine
- **IVFFlat** Index mit `lists=50` für ~7k vectors
- **`ivfflat.probes=50`** function-attribute SET (forces exact NN search, ~1% recall improvement)

**ML:**
- **SPECTER2** (`allenai/specter2_base` + `allenai/specter2` proximity adapter)
- **transformers** + **adapters** HuggingFace libraries (Python)
- **psycopg2** für Python→Postgres
- Batch processing mit length-bucketing (~2-3x speedup vs random order)

**External APIs:**
- **CrossRef** — DOI metadata, citations, abstracts
- **OpenAlex** — open scholarly metadata (~250M works)
- **Unpaywall** — open-access status + PDF URLs
- **Semantic Scholar** — citation graph, paper enrichment
- **OpenRouter** — LLM provider aggregator (BYOK)
- **MeisterTask** — task creation für `decision = 'pitch'`
- **HuggingFace** — Model hosting (download once, cache locally)

**Dev/Test:**
- **Playwright** für e2e (smoke + visual)
- **Vitest** installed aber kaum used (Phase 4 target)
- **ESLint** via flat config (`eslint.config.mjs`)
- **TypeScript strict** mode

**Deploy:**
- **Vercel** für Next.js (auto-deploy from main)
- **Supabase managed** für Postgres (eu-west-3 region, Pooler URL)
- Local Supabase via Docker (`supabase start`, Ports `544xx`)

### 3.3 Domain-Model

**Core Entities:**

```
                    ┌─────────────────┐
                    │  publications   │ ← TYPO3-WebDB-Mirror
                    ├─────────────────┤
                    │ id (UUID)       │
                    │ webdb_uid       │
                    │ title           │
                    │ abstract        │
                    │ enriched_abstract│ ← from CrossRef/OpenAlex/Unpaywall
                    │ summary_de/_en  │ ← from WebDB
                    │ press_score     │ ← from LLM analysis
                    │ press_similarity│ ← from k-NN top-5 cluster
                    │ public_accessibility/societal_relevance/...│ (5 dims)
                    │ pitch_suggestion│ ← from LLM
                    │ haiku           │ ← from LLM (5-7-5)
                    │ decision        │ ← undecided|pitch|hold|skip
                    │ snooze_until    │
                    │ flag_notes (json)│
                    │ ...             │
                    └────────┬────────┘
                             │
                  ┌──────────┴──────────┐
                  │                     │
        ┌─────────▼──────────┐  ┌──────▼────────┐
        │ publication_       │  │ press_releases │ ← matched + orphan
        │   embeddings       │  ├────────────────┤
        ├────────────────────┤  │ id (UUID)      │
        │ publication_id (PK)│  │ publication_id │ ← NULL für orphan
        │ model (TEXT)       │  │ doi (natural key)│
        │ embedding (vec 768)│  │ url            │
        │ source_text_hash   │  │ released_at    │
        │ computed_at        │  │ paper_title    │ ← from CrossRef
        └────────────────────┘  │ news_title     │ ← from TYPO3
                                │ abstract       │ ← from CrossRef für orphan
                                │ keywords       │ (NEW orphan-enriched)
                                │ authors        │
                                │ lang (de|en|null)│
                                └────────┬───────┘
                                         │
                              ┌──────────▼──────────────┐
                              │ press_release_embeddings│ ← NEU (Phase orphan)
                              ├─────────────────────────┤
                              │ press_release_id (PK)   │
                              │ model                   │
                              │ embedding (vec 768)     │
                              │ source_text_hash        │
                              └─────────────────────────┘

                              ┌─────────────────────────┐
                              │ press_cluster_view      │ ← SSOT für k-NN
                              ├─────────────────────────┤
                              │ kind: publication|orphan│
                              │ embedding               │
                              │ publication_id (UUID?)  │
                              │ exclude_pub_id (UUID?)  │
                              │ press_release_id        │
                              │ title, released_at,     │
                              │ press_url               │
                              └─────────────────────────┘
                              (Read by: refresh_press_cluster_centroid,
                                       refresh_press_similarity_knn,
                                       similar_pressed_pubs)
```

**Side-Entities (von WebDB):**
- `persons` (Personen-Datensätze mit ORCID, E-Mail, Bio)
- `orgunits` (Institute, Bereiche, Akronyme)
- `extunits` (externe Einheiten)
- `projects` (Forschungsprojekte mit DE/EN-Summaries, Förderungstyp)
- `lectures` (Vorträge — Keynotes, Named Lectures, etc.)
- `oestat6_categories` (Österreichische Wissenschaftstaxonomie, 1.411 Codes)
- `publication_types` (Typo-3-Lookup für Beitrag-in-Fachzeitschrift, etc.)
- `person_publications`, `orgunit_publications`, `publication_projects` (M:N)
- `sessions` (Triage-Sessions mit ID, started_at, decided_by)

### 3.4 Data Flow (komplette Pipeline)

```
Step 1: WebDB Import (nightly cron oder manuell)
  TYPO3 MySQL Dump (~660 MB unkomprimiert)
  └─► scripts/webdb-import.mjs
      • Skips t3ver_*/mirror tables, deleted=1 rows
      • UPSERT pattern (non-destructive seit 2026-04-30)
      • ~1 min für 37k publications + junctions
      └─► publications + persons + orgunits + projects + lectures + oestat6

Step 2: Enrichment (manual via /publications UI oder enrichment-batch endpoint)
  publications WHERE enrichment_status = 'pending'
  └─► /api/enrichment/batch (SSE-stream)
      ↓
      CrossRef → enriched_abstract, journal, peer_reviewed, citations
      OpenAlex → open_access_status, oa_type, keywords
      Unpaywall → pdf_url, oa_color
      Semantic Scholar → enriched_abstract fallback, citations
      PDF extraction (pdfjs) → full_text_snippet
      └─► publications.enriched_*, enrichment_status = 'enriched'|'partial'|'failed'

Step 3: Orphan-Enrichment (separat für press_releases ohne publication_id)
  press_releases WHERE publication_id IS NULL AND enrichment_status = 'pending'
  └─► scripts/enrich-orphans.ts (or via enrichment-batch endpoint variant)
      ↓
      Same APIs as Step 2, target ist press_releases-Felder
      └─► press_releases.abstract, paper_title, authors, keywords, etc.

Step 4: LLM Analysis (manual via /publications UI)
  publications WHERE analysis_status = 'pending' AND enrichment_status IN ('enriched', 'partial')
  └─► /api/analysis/batch (SSE-stream)
      ↓
      OpenRouter call mit prompt + 5-Dim-rubric + pitch + haiku request
      Streaming response parsed per-pub
      └─► publications.press_score, public_accessibility, ..., pitch_suggestion, haiku

Step 5: Embedding Compute (lokal-only, manuell oder cron)
  publications + press_releases (orphan only)
  └─► scripts/embeddings/compute-embeddings.py --target=local
      ↓
      SPECTER2-Modell laden (~440MB einmalig)
      Pass 1: publications mit hash-skip
      Pass 2: orphan press_releases mit hash-skip
      Batch=16, length-bucketed, BATCH normalize, CLS-Token-Extract
      └─► publication_embeddings + press_release_embeddings
      └─► refresh_embedding_pipeline RPC ruft auf:
          - refresh_press_cluster_centroid (observability)
          - refresh_press_similarity_knn (k=5)
            └─► publications.press_similarity materialized

Step 6: Embedding-Push lokal → prod
  pg_dump --data-only -t publication_embeddings (oder via doi-natural-key
  für press_release_embeddings — siehe Memory)
  └─► psql "$PROD_URL"
      └─► prod publication_embeddings + press_release_embeddings synced
      └─► trigger fires refresh_embedding_pipeline auf prod

Step 7: Triage (UI-Flow)
  /review zeigt undecided pubs ranked by press_score (default) oder combined
  Reviewer klickt Pitch/Hold/Skip in DecisionToolbar
  └─► /api/publications/[id]/decision PATCH
      ├─► publications.decision = '...' + decided_at + decided_by + decided_in_session
      ├─► lazy session-create wenn keine aktiv (ensureSessionId)
      └─► IF decision='pitch':
          └─► /api/meistertask/push (lib/meistertask/push.ts)
              ↓
              MeisterTask Create-Task API call
              └─► publications.meistertask_task_id + token (für deep-linking)
```

### 3.5 React-Patterns (etabliert in der Codebase)

**State Management:**
- Server-State via TanStack Query (`useApiQuery` wrapper)
- URL-State via nuqs (filters, page, etc.)
- Local Storage via custom stores (`settings-store.ts`, `session-store.ts`)
- Component-Local via `useState`
- KEINE global state library (kein Redux, Zustand, Jotai)

**Animation:**
- `motion/react` für component-level (FLIP animations, layout shifts)
- `motion-number` für animated counters
- Tailwind transitions für hover/state changes
- `animate-capybara-*` keyframes für Modal-Capybaras (in globals.css)
- `@keyframes haikuFade` für Wort-für-Wort Haiku-Reveal

**Forms:**
- Plain controlled inputs (kein react-hook-form, kein zod-resolver)
- Validation via zod (selten) oder per-field
- Save-on-blur oder explicit save button

**Hooks-Pattern:**
- `'use client'` für Components mit Hooks
- Server Components default für reine Anzeige
- Composition über Inheritance (kein HOC-Pattern)

**InfoBubble-System:**
- Global Toggle via `useInfoBubblesEnabled` hook
- Content via `EXPL`-Map in `lib/explanations.tsx` (id-based)
- ODER inline `content={{title, body, formula?, example?, note?}}`
- Renders nothing wenn globally disabled
- Hybrid: hover (desktop) + tap (mobile) + click-to-pin

**DECISION_VARIANTS-Pattern:**
- Single source of truth in `components/decision-badge.tsx`
- Jede Decision-State: `Icon`, `label`, `accentBorder`, `badgePill`,
  `largeButton` (active/idle), `iconButton`
- Alle Surfaces (DecisionBadge, DecisionToolbar, PublicationFlag) lesen daraus

### 3.6 Backend-Patterns (etabliert)

**Auth:**
- Password-Gate via `/api/auth/gate` POST
- Server setzt httpOnly Cookie `gate`
- Client setzt sessionStorage marker `storyscout-auth-marker`
- Middleware check pro Request
- `lib/api-helpers.ts:getSupabaseFromRequest` zentralisiert Cookie-Handling

**API-Routes:**
- App Router style: `export async function GET/POST/PATCH/DELETE`
- Response via `NextResponse.json` oder Streaming `ReadableStream`
- Error-handling: try/catch + return 4xx/5xx JSON

**SSE-Streaming (Enrichment + Analysis):**
- `Response` mit `ReadableStream` body
- `text/event-stream` content-type
- Frames im Format `event: <type>\ndata: <json>\n\n`
- Client-side: `fetch + reader.read()` mit decoder + buffer

**Trigger-System (Postgres):**
- `trg_press_releases_refresh_embedding` (STATEMENT-level, fires on insert/update/delete)
- `press_releases_promote_drop_orphan_embedding` (ROW-level, fires on UPDATE OF publication_id)
- `trg_publications_decided_at_sync` (auto-manages decided_at on decision change)
- Trigger-Reihenfolge: ROW vor STATEMENT in Postgres

**RPCs (Postgres functions):**
- `refresh_press_cluster_centroid(model TEXT)` — VOLATILE, returns observability
- `refresh_press_similarity_knn(model TEXT, k INT)` — VOLATILE, materializes scores
- `refresh_embedding_pipeline(model TEXT)` — VOLATILE, convenience wrapper
- `similar_pressed_pubs(pub_id UUID, model TEXT, limit INT)` — STABLE,
  function-attribute `SET ivfflat.probes TO 50` (statt SET LOCAL inside body —
  würde Postgres ablehnen für STABLE function)
- `promote_press_release_orphans()` — VOLATILE, links orphans zu neuen pubs
- `publication_with_relations(pub_id UUID)` — STABLE, fetches with joins

### 3.7 Existing Patterns vor OSS-Cleanup-„Aufräumen"

**Was bleiben kann:**
- Component-Library (`tint-badge`, `section-label`, etc.) — clean, reusable
- DECISION_VARIANTS pattern — saubere single-source-of-truth
- press_cluster_view pattern — saubere single-source-of-truth
- Discriminated unions für State-Variants
- EmbedTarget + process_pass — clean data abstraction

**Was Phase 2 aufräumt:**
- API-Routes mit eingebetteter Business-Logic (~10 betroffene Routes)
- Inkonsistente `lib/`-Strukturierung (server-only vs shared unklar)
- Fehlende Type-Boundaries zwischen Client/Server-Code

**Was Phase 3 aufräumt:**
- Raw-Supabase-JS-Queries ohne TypeScript-Schema-Sicherheit
- Manuelle Type-Casts (`as Publication[]` etc.)
- DB-Column-Renames würden silent breakings produzieren

**Was Phase 4 aufräumt:**
- Test-Coverage near zero für business logic (Vitest installed, kaum tests)
- Keine CI/CD pipeline
- Refactoring-Confidence basiert nur auf Playwright e2e

---

## 4. Phasen-Übersicht

Vier Phasen, in dieser Reihenfolge. Jede Phase ist in sich abgeschlossen
und liefert OSS-Wert auch wenn die nächste verschoben wird.

| # | Phase | Inhalt | Aufwand | Priorität | OSS-Impact |
|---|---|---|---|---|---|
| **1** | **Foundation Docs** | README rewrite, ARCHITECTURE.md, CONTRIBUTING.md, LICENSE, docs/ reorg | 1-2 Sessions (4-6h) | **Höchste** | Ohne kein OSS-Release möglich |
| **2** | **Folder-Reorg + Business-Logic-Extraction** | `lib/server/` + `lib/shared/` Convention, API-Routes als thin HTTP-Layer, ESLint-Boundaries | 2-3 Sessions (~1 Woche) | Hoch | Adressiert „Schlampig"-Gefühl direkt |
| **3** | **Drizzle ORM Migration** | Type-safe DB-Layer statt Raw-Supabase-Queries, Schema-introspection | 2-3 Sessions (~1 Woche) | Mittel | Code-Quality + Contributor-DX |
| **4** | **Test-Coverage + CI** | Vitest Unit-Tests für `lib/server/` + `lib/shared/`, GitHub Actions Workflow | 2-3 Sessions (~1 Woche) | Mittel | Confidence + Contributor-Onboarding |

**Gesamt: 7-11 Sessions / 3-4 Wochen Solo-Dev-Zeit.**

---

## 5. Phase 1 — Foundation Docs (im Detail)

### 5.1 Ziel

Ein Erstkontakt-Contributor soll innerhalb von **30 Minuten** verstanden
haben:
- Was die App tut + warum
- Wie der Tech-Stack aussieht
- Wie er lokal devven kann
- Wie er einen PR submitten kann
- Wo die Code-Conventions stehen
- Welche externen Services nötig sind

### 5.2 README.md (komplette Rewrite-Spec)

**Aktueller Stand:** `README.md` ist 4KB, technisch-korrekt aber
„dies-tut-die-App"-stilig, nicht OSS-Release-stilig.

**Neue Struktur:**

```markdown
# StoryScout — Press Triage for Research Publications

[Badges-Reihe:]
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Built with Next.js](https://img.shields.io/badge/Next.js-16-black)](...)
[![Status: Active](...)]
[![PRs Welcome](...)]

> Open-source web app helping research-institution press teams identify
> their most pitchable publications, scored by an LLM across 5 dimensions
> and ranked by semantic similarity to past press successes via SPECTER2
> embeddings.

[Hero-Screenshot oder Animated-GIF des /review-Triage-Workflows]

## What it does

Drei klare Bullets mit Icons:
- **Triage queue** — Pubs gerankt nach press_score + press_similarity,
  mit per-Pub Pitch/Hold/Skip
- **AI scoring** — LLM scoring auf 5 Dimensionen (Public Accessibility,
  Societal Relevance, Novelty, Storytelling Potential, Media Timeliness)
  + pitch suggestion + 5-7-5 Haiku
- **Semantic similarity** — SPECTER2-768-dim Embeddings vergleichen neue
  Pubs mit historischen Press-Releases (k-NN Top-5)

## Why it exists

Die ÖAW-Pressestelle bewertet pro Jahr ~7.000 wissenschaftliche
Publikationen auf Press-Eignung. Manuelles Screening dauert. StoryScout
liefert vorsortierte Kandidaten — der Mensch entscheidet, die Maschine
filtert. Open-Source weil andere Forschungsinstitutionen das gleiche
Problem haben und keine Lust auf Vendor-Lock-in.

## Screenshots

[Section mit 3-5 Screenshots: Dashboard, /review queue, Publication detail,
similar-pressed card, score-distribution chart]

## Quick Start

### Prerequisites

- **Node.js ≥ 20** (LTS recommended)
- **Supabase CLI** (`brew install supabase/tap/supabase` or [Linux/Windows install](https://supabase.com/docs/guides/cli))
- **Docker** (for Supabase local stack)
- **Python 3.10+** (optional — only if you need to run SPECTER2-Embedding-Compute locally)
- **OpenRouter API key** (for LLM analysis — they offer free tier)

### Setup (5 minutes)

```bash
git clone https://github.com/<org>/oeaw-press-relevance.git
cd oeaw-press-relevance
npm install

# Local Supabase stack (Postgres + Studio + Auth + Storage)
supabase start
supabase migration up --local

# Environment vars
cp .env.local.example .env.local
# Edit .env.local — fill in:
#   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=<from `supabase status`>
#   SUPABASE_URL=<same as above>
#   SUPABASE_ANON_KEY=<same as above>
#   OPENROUTER_API_KEY=sk-or-...
#   GATE_PASSWORD=<your-choice>  # Schutz vor random internet traffic

# Run dev server
npm run dev
```

Open http://localhost:3000 — login with `GATE_PASSWORD`.

### Loading Data

Three options:

**A) Sample data (recommended for evaluation)**
```bash
# Coming soon: scripts/load-sample-data.mjs with anonymized OeAW pubs
```

**B) TYPO3-WebDB MySQL dump** (für OeAW-internal use)
See [docs/WEBDB_IMPORT.md](docs/WEBDB_IMPORT.md).

**C) Your own data**
Adapt `scripts/webdb-import.mjs` for your CMS-format. The Postgres
schema in `supabase/migrations/` ist the contract.

### Running Embedding Pipeline (optional)

For press-similarity scoring (top-3 nearest pressed pubs etc.):

```bash
cd scripts/embeddings
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt  # transformers, adapters, torch, psycopg2, numpy

python compute-embeddings.py --target=local
# ~90 min initial run (model download + CPU inference)
# Subsequent runs: hash-skip-fast (~sub-second)
```

### Deploy to Production

**Vercel (default):**
```bash
npx vercel --prod
```
Set env vars in Vercel dashboard. Supabase project pre-configured.

**Self-hosted (für Universitäten ohne Vercel-Account):**
See [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) — Docker compose, nginx
reverse-proxy, separate Postgres-Setup.

## Pages Overview

| Page | Description |
|------|-------------|
| `/` | Dashboard: stats, top pubs, score distribution, dimension radar, top keywords |
| `/review` | Triage queue — Pitch/Hold/Skip + Snooze, mobile bottom-sheet variant |
| `/publications` | Browse + filter + enrich + analyze |
| `/publications/[id]` | Detail: pitch, summaries, haiku, similar-pressed card, decision toolbar |
| `/researchers` | Leaderboard — Spotlight Top-3 + ranked table + beeswarm distribution |
| `/persons/[id]` | Person profile: stats, activity chart, co-authors, publications |
| `/press-releases` | Press-release tracking — matched + orphan tabs |
| `/settings` | Config: API keys, model selection, reviewer-name |
| `/upload` | WebDB import instructions |

## Stack

| Layer | Tech | Why this |
|---|---|---|
| Framework | Next.js 16 App Router | SSR + API routes + Vercel deploys, React 19 stable |
| UI | shadcn/ui + Radix UI + Tailwind v4 | Best-in-class component quality, fully customizable |
| State | TanStack Query + nuqs + localStorage | URL-bound filters, server state caching, no global store overhead |
| Animation | motion / motion-number / d3-force | FLIP, animated counters, beeswarm collision |
| DB | Supabase Postgres + pgvector | Managed PG with vector extension, self-hostable |
| Embedding | SPECTER2 (`allenai/specter2_base`) | Scientific-trained, 768-dim, free |
| LLM | OpenRouter (Claude, GPT, DeepSeek...) | Single key, model-agnostic, BYOK |
| ML offline | Python + transformers + adapters | Standard stack for SPECTER2 inference |
| Testing | Playwright (e2e) + Vitest (unit, WIP) | Visual snapshots + business-logic tests |

## Documentation

- [Architecture](ARCHITECTURE.md) — domain model, data flow, design rationale
- [Contributing](CONTRIBUTING.md) — dev setup, PR process, code conventions
- [Web-DB Import](docs/WEBDB_IMPORT.md) — schema mapping, ETL details
- [Self-Hosting](docs/SELF_HOSTING.md) — Docker, nginx, prod-Postgres
- [Roadmap](docs/ROADMAP.md) — coming features + known limitations
- [Memory Log](docs/MEMORY.md) — design-decisions chronology (advanced)

## Score Dimensions

| Dimension | Weight | Description |
|-----------|--------|-------------|
| Public Accessibility | 20% | How easily non-experts can understand |
| Societal Relevance | 25% | Impact on health, environment, economy |
| Novelty Factor | 20% | Breakthrough or surprising nature |
| Storytelling Potential | 20% | Journalist narrative potential |
| Media Timeliness | 15% | Connection to current discourse |

Empirical validation see [docs/SCORING_VALIDATION.md].

## License

MIT — see [LICENSE](LICENSE). Use, fork, modify, distribute freely.
By contributing, you agree your contribution is MIT-licensed.

## Acknowledgements

- **SPECTER2 model** by Allen Institute for AI
- **ÖAW Pressestelle** for funding, dogfooding, and the initial problem
- **OpenRouter** for the unified LLM API
- **Supabase** for the managed Postgres + open-source self-host option
- Contributors: see [CONTRIBUTORS.md](CONTRIBUTORS.md)

## Status

🟢 **Active development** — used in production at ÖAW.
See [GitHub Issues](https://github.com/<org>/oeaw-press-relevance/issues) for roadmap.

## Citation

If you use StoryScout in research, please cite:
```
@software{storyscout2026,
  title = {StoryScout: AI-Powered Press Triage for Research Publications},
  author = {Leihs, Matthias and contributors},
  year = {2026},
  url = {https://github.com/<org>/oeaw-press-relevance}
}
```
```

**Aufwand:** ~1.5h für solide Version inkl. Screenshots-Aufnahme.

### 5.3 ARCHITECTURE.md (komplette Neuschreibung)

**Struktur:**

```markdown
# Architecture

This document is for contributors. It explains the domain model, the
data flow through the application, the rationale for the major
technical decisions, and the key abstractions you'll encounter.

## Table of Contents

1. [Domain Model](#domain-model)
2. [Data Flow](#data-flow)
3. [Tech Stack Rationale](#tech-stack-rationale)
4. [Folder Structure](#folder-structure)
5. [Key Abstractions](#key-abstractions)
6. [External Dependencies](#external-dependencies)
7. [Non-Goals](#non-goals)
8. [Open Architectural Questions](#open-architectural-questions)

## Domain Model

### Core Entities

[Tabular description of each entity, key fields, what it represents]
[Diagram (ASCII or mermaid) of relationships]
[Key invariants per entity]

### Decision State Machine

```
undecided ──pitch──► pitch ──(immutable)──►
       ├──hold─────► hold (with optional snooze_until)
       └──skip─────► skip
       └──reset────► undecided
```

Allowed transitions, side effects per transition (MeisterTask push on pitch, etc.).

### Embedding-Cluster Membership

[Diagram showing matched vs orphan, exclude_pub_id for self-exclusion,
distinct-on for n:1 defensive logic]

## Data Flow

[Full pipeline ASCII-diagram from Section 3.4 of this plan, copied + expanded
with explicit error-recovery branches]

## Tech Stack Rationale

### Why Next.js + Supabase
[Reasons from §1.2 of this plan]

### Why SPECTER2 (and not mBERT/e5/BGE)
- Allen-AI off-the-shelf, scientific-trained on Semantic Scholar (~5M papers)
- 768-dim sweet spot zwischen quality + storage cost
- Limitation: English-only — see "Open Questions" section
- Alternative for future: multilingual-e5-large or BGE-M3 as second cluster source

### Why no FastAPI sidecar
- ML inference is offline (compute-embeddings.py as batch)
- Hot-path queries direct Postgres
- Sidecar adds 2 deploys, 2 auth-stacks, +50-100ms latency without solving a current problem
- See §1.2 of OSS_READINESS_PLAN.md for full rationale

### Why no Phoenix LiveView rewrite (yet)
- Architecturally better fit for multi-user real-time triage
- Rewrite cost 4-8 weeks + Elixir learning curve
- shadcn/Radix ecosystem loss is significant
- Triggers for reconsidering: real-time-collab feature, Vercel timeout pain, team growth

### Why no GraphQL
- Single client + DB-near schema = REST is simpler
- Type-safety via Drizzle (Phase 3) without GraphQL overhead
- Supabase auto-PostgREST is GraphQL-adjacent (introspection-based)

### Why TanStack Query (vs SWR vs raw fetch)
- Cache invalidation patterns built-in
- DevTools support
- Used elsewhere in TypeScript ecosystem — contributors will know it

## Folder Structure

[Complete folder listing from §3.1 of this plan, with role of each folder
explicitly stated]

[After Phase 2: updated lib/server/ + lib/shared/ structure documented]

## Key Abstractions

### `DECISION_VARIANTS` (components/decision-badge.tsx)
Single source of truth for decision-state visuals. Every surface (badge,
button, icon, flag) reads from this. To add a new decision state:
1. Add entry to DECISION_VARIANTS
2. Update `Decision` type in lib/types.ts
3. Update DB enum (migration)
That's it — all surfaces update automatically.

### `press_cluster_view` (supabase/migrations/...)
Single source of truth for "what's in the press cluster". Matched
publication_embeddings UNION ALL orphan press_release_embeddings with
DISTINCT ON pub_id (defensive against n:1 press_releases per pub).
All RPC functions read from this view.

### `EmbedTarget` (scripts/embeddings/compute-embeddings.py)
Pure-data dataclass for "a row to embed". Pubs and orphan press_releases
have identical shape → identical process code via `process_pass`.

### Theme Tokens (app/globals.css)
Tailwind v4 `@theme inline` with CSS-vars per light/dark mode. Custom
extension: `--color-chart-bucket-1..10` for ScoreDistributionChart.
**Convention:** always use semantic tokens (`bg-card`,
`text-muted-foreground`) — never hardcoded neutrals. See
[CONTRIBUTING.md](CONTRIBUTING.md#styling) for the full mapping table.

### EXPL-Map (lib/explanations.tsx)
ID-keyed dictionary of `Explanation` objects (title, body, formula?,
example?, note?). InfoBubble components reference these by ID. New
metric/score/term → add EXPL entry → reference via `<InfoBubble id="...">`.

### `useApiQuery` (lib/use-api-query.ts)
Wrapper around TanStack Query that adds auth headers. Use this — never
plain `fetch` — for any DB-backed query in components.

### Query Keys (lib/query-keys.ts)
Centralized cache keys: `QK.publications`, `QK.publication(id)`,
`QK.reviewQueue`, etc. Invalidate via `queryClient.invalidateQueries({
queryKey: QK.X })` after mutations.

## External Dependencies

### Source APIs (read-only)
[Each with: URL, what data, rate limits, free tier, auth]

### Sink APIs
[MeisterTask + OpenRouter with same detail]

### Data Storage
- Supabase Postgres (primary)
- pgvector (768-dim cosine)
- IVFFlat index (lists=50, probes=50 forced)
- Local: Docker via supabase CLI, ports 54421-54429 (siehe Memory)

## Non-Goals

What this app is NOT:
- Not a full publication manager (no editing of source-of-truth metadata)
- Not a press-release authoring tool (just triage + ranking)
- Not real-time multi-user collaborative (no live cursors, no chat)
- Not a full auth system (password-gate is anti-bot, not ACL)
- No hot-path ML (embedding inference is offline batch)
- Not a citation analysis tool (citation data is contextual, not primary)

## Open Architectural Questions

### `press_release` n:1 publication
Schema allows multiple press_releases per pub (DE+EN variants of same
release). Currently 1:1 in data, defensive DISTINCT ON in view. If n:1
becomes real, UI display logic for variant selection needed.

### German pubs + SPECTER2
~8% of corpus is German-only. English-trained SPECTER2 produces
embedding-collapse: DE-pubs cluster in a "garbage subspace", similarity
to mostly-English press cluster is noise, not signal. Current
mitigation: UI hint. Future option: multilingual-e5-large as second
pipeline + separate cluster source.

### press_score formula refit
Current 20/25/20/20/15 weighting was hypothesis-driven, not empirical.
Validation found societal_relevance ≈ 0 effective, novelty + storytelling
~75% of total variance. V2 formula recommended, not yet applied. See
[memory file: press_score_alignment_finding.md].

### Vercel function timeout for enrichment
SSE-streams break at 60s (Vercel Pro). For >60s pipelines (250+ pubs),
need migration to Inngest/Trigger.dev job queue. Current workaround:
chunked client-side calls.

### Recharts theming
Chart colors are partially theme-aware (via useTheme hook in
activity-chart.tsx, stroke classes in beeswarm-view.tsx). Inline SVG
strokes/fills still hardcoded #hex in some places. Roadmap: full
currentColor + CSS-var migration.
```

**Aufwand:** ~2-3h für solide Version mit Diagrammen.

### 5.4 CONTRIBUTING.md (komplette Neuschreibung)

```markdown
# Contributing to StoryScout

Thanks for your interest! This guide covers everything you need to
contribute — from local setup to PR submission.

## Code of Conduct
We follow the [Contributor Covenant](https://www.contributor-covenant.org/).
Be excellent to each other.

## Development Setup

### Prerequisites
- **Node.js ≥ 20.x** (LTS recommended) — check with `node -v`
- **Supabase CLI** — `brew install supabase/tap/supabase` or `npm install -g supabase`
- **Docker** — required by Supabase local stack
- **Python 3.10+** with venv — only for SPECTER2-Embedding-Compute
- **uv** (recommended) or **pip** for Python deps

### First-Time Setup

```bash
# 1. Clone
git clone https://github.com/<org>/oeaw-press-relevance.git
cd oeaw-press-relevance

# 2. Install deps
npm install

# 3. Local Supabase stack (~30s first run, downloads Docker images)
supabase start
# Note ports printed: API on 54421, DB on 54422, Studio on 54423

# 4. Apply migrations
supabase migration up --local

# 5. Environment vars
cp .env.local.example .env.local
# Edit .env.local — minimum required:
#   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=<from `supabase status`>
#   SUPABASE_URL=http://127.0.0.1:54421
#   SUPABASE_ANON_KEY=<same>
#   OPENROUTER_API_KEY=sk-or-...  # optional for UI-dev without analysis
#   GATE_PASSWORD=<your-choice>

# 6. Run
npm run dev
# Open http://localhost:3000, login with GATE_PASSWORD
```

### Optional: Embedding Pipeline

Only needed if you're working on press-similarity-related features.

```bash
cd scripts/embeddings
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Test the script (no-op if hashes match, ~5s)
python compute-embeddings.py --target=local
```

First real run downloads SPECTER2 model (~440MB) and takes ~90 min on
CPU. Use `--max-pubs=400` for chunked-restart pattern (WSL2 OOM
workaround — see memory log).

### Optional: Run with Production-Like Setup

To test against a production-Supabase project:
```bash
supabase link --project-ref <your-prod-ref>
supabase db push  # applies new migrations to prod
```

Don't push migrations to prod from your fork — open a PR instead.

## Running Tests

### End-to-End (Playwright)

```bash
# First time only
npx playwright install chromium

# Run all tests
npx playwright test

# Specific spec
npx playwright test e2e/visual.spec.ts

# UI mode (interactive debugging)
npx playwright test --ui

# Generate visual baselines (after intentional UI change)
rm -rf test-results/visual-snapshots/
npx playwright test e2e/visual.spec.ts
# Inspect snapshots in test-results/visual-snapshots/
# Commit them if they look right
```

26 visual snapshots + 4 smoke tests. Visual baselines are gitignored
(generated per run); they're inspected manually as PR-attachments.

### Unit (Vitest — coming Phase 4)

```bash
npm run test          # one-shot run
npm run test:watch    # watch mode
```

## Code Conventions

### TypeScript

- **Strict mode enabled** — see `tsconfig.json`
- Use `type` for simple data shapes, `interface` only when extending
- **Discriminated unions** for variant types — see `SimilarPressed` in
  `press-reference-card.tsx` for the pattern
- **Pure functions** preferred for business logic (Phase 2: lives in
  `lib/server/`)
- **No `any`** — use `unknown` + type narrowing, or proper types
- Import paths via `@/` alias (e.g. `@/lib/types`)

### Comments

**Default: no comments.** Code should be self-explanatory through good
naming and structure.

**Exception: WHY-comments** for:
- Hidden invariants ("This must run before X because...")
- Non-obvious workarounds ("Postgres rejects SET in STABLE functions,
  hence the function-attribute form...")
- Historical context where helpful ("Was inline UNION, factored to
  view 2026-05-11 because three RPCs duplicated the cluster logic")

**Avoid:**
- WHAT-comments (`// returns the user id` next to `return user.id`)
- PR/issue references (`// for #123`) — belongs in commit message
- Status markers (`// TODO: someday`) — open an issue instead

### Styling

- **Tailwind v4** with semantic tokens
- **NEVER** hardcoded `text-neutral-*`, `bg-white`, `border-neutral-*`
- **Mapping table** for theme tokens:

| Hardcoded | Semantic Replacement |
|---|---|
| `bg-white` | `bg-card` (component surfaces) or `bg-background` (full-page) |
| `bg-neutral-50` | `bg-muted/50` |
| `bg-neutral-100` | `bg-muted` |
| `bg-neutral-200` | `bg-muted` (chips) or `bg-border` (dividers) |
| `text-neutral-300` | `text-muted-foreground/50` |
| `text-neutral-400` | `text-muted-foreground/70` |
| `text-neutral-500` | `text-muted-foreground` |
| `text-neutral-600` | `text-foreground/80` |
| `text-neutral-700` | `text-foreground` or `text-foreground/90` |
| `text-neutral-800/900` | `text-foreground` |
| `border-neutral-200/300` | `border-border` |
| `divide-neutral-100` | `divide-border/60` |
| `hover:bg-neutral-100` | `hover:bg-muted` |
| `bg-neutral-900 text-white` (inverted) | `bg-foreground text-background` |

- **shadcn/ui components in `components/ui/`** — DO NOT modify directly,
  override via className on the consuming side (twMerge handles conflicts)
- **Color-tint badges** — use `<TintBadge color="...">` not raw classes
- **Section labels** — use `<SectionLabel>` not raw `<h4 className="...">`
- **Status alerts** — use `<StatusBanner variant="...">` not raw `<div>`

### Commits

**Conventional Commits**: `type(scope): subject`

```
type(scope): short subject in German or English (≤72 chars)

Optional body explaining WHY, not WHAT. Wrap at 72 chars.
Multiple paragraphs OK.

Co-Authored-By: AI assistant or pair-programmer (optional)
```

**Allowed types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`,
`perf`, `style`, `build`, `ci`.

**Examples from this repo:**
```
feat(press-release): orphan press_release embeddings in k-NN-Cluster
fix: press_cluster_view DISTINCT ON pub_id + smoke timeout 15→25s
refactor(ui): dark-mode-ready token-sweep + extracted components
docs(architecture): add embedding-pipeline section
```

### Branches & PRs

- **main** = production (auto-deploys to Vercel)
- **feature/<name>** for new features
- **fix/<name>** for bug fixes
- **docs/<name>** for documentation
- **chore/<name>** for refactors/tooling

**PR template** (will be added in Phase 1.5):
```markdown
## What

Brief description of change

## Why

Motivation, link to issue if applicable

## How tested

- Local dev: yes/no
- Playwright e2e: yes/no
- Manual UI check: yes/no
- New tests added: yes/no

## Screenshots (if UI change)

[before / after]
```

**PR checklist:**
- [ ] Type-check passes: `npx tsc --noEmit`
- [ ] Lint passes: `npx eslint .`
- [ ] Playwright e2e passes: `npx playwright test`
- [ ] No new ESLint warnings introduced
- [ ] Migrations are forward-compatible (don't break existing data)
- [ ] If feature: ARCHITECTURE.md or README.md updated
- [ ] Commit messages follow conventional commits

### Migrations

DB migrations live in `supabase/migrations/` with timestamp-prefixed
names (e.g. `20260511000001_orphan_press_release_embeddings.sql`).

**Naming:** `YYYYMMDDhhmmss_short_description.sql`

**Conventions:**
- IDEMPOTENT: use `CREATE IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP IF EXISTS`
- DOCUMENTED: add `COMMENT ON TABLE/COLUMN/FUNCTION` for non-obvious things
- REVERSIBLE: include rollback notes in a comment header where applicable
- ATOMIC: one logical change per migration

**Forbidden:**
- Editing applied migrations (production may already have them)
- Destructive operations without explicit comment + reason

## Areas for Contribution

### Good First Issues

Look for the `good-first-issue` label on GitHub. Examples:
- I18n (German↔English UI toggle)
- A11y improvements (keyboard nav, screen reader labels)
- Score-Distribution-Chart variants (alternative visualizations)
- Documentation: per-feature deep-dives in `docs/`

### Medium-Sized Tasks

- Multilingual-Embedding-Pipeline (mE5 or BGE-M3 as 2nd cluster source)
- Inngest/Trigger.dev migration for >60s enrichment pipelines
- Real-time-collab via Supabase Realtime (Presence in /review)
- press_score formula refit per [memory: press_score_alignment_finding.md]

### Large/Architectural

- Backend rewrite to Phoenix LiveView (see OSS_READINESS_PLAN.md §1.2)
- ML hot-path via FastAPI sidecar (if real-time embedding becomes needed)
- Multi-tenancy (one instance serving multiple universities)

**For large contributions:** open an issue first to align before
investing weeks of work.

## License

MIT — by submitting a PR you agree your contribution is MIT-licensed.

## Questions

- GitHub Issues for bugs + feature requests
- GitHub Discussions for general questions (when enabled)
- Direct contact: [your-email or contact channel]
```

**Aufwand:** ~1.5h.

### 5.5 docs/ Folder Reorganization

**Aktueller Stand:** Root-Level enthält viele interne Docs:
```
BEWERTUNGS_RUBRIK.md    HANDOVER.md             IMPLEMENTATION.md
PROD_SETUP_PLAN.md       RESEARCHERS_PLAN.md    TECH_HANDOVER.md
TRIAGE_LOOP_PLAN.md
```

**Aktion:**
```bash
mkdir -p docs
mv HANDOVER.md TECH_HANDOVER.md IMPLEMENTATION.md PROD_SETUP_PLAN.md \
   TRIAGE_LOOP_PLAN.md RESEARCHERS_PLAN.md BEWERTUNGS_RUBRIK.md \
   docs/
```

Plus erstellen:
- `docs/WEBDB_IMPORT.md` — TYPO3-MySQL → Postgres mapping, schema details
- `docs/SELF_HOSTING.md` — Docker compose, nginx, separate Postgres
- `docs/SCORING_VALIDATION.md` — Press-score-formula empirical analysis
- `docs/MEMORY.md` — Curated subset of decision-log from `~/.claude/...` memory files
- `docs/ROADMAP.md` — Feature roadmap

Link updates in:
- README.md (Documentation section)
- ARCHITECTURE.md (cross-references)
- Any commit hashes referencing old paths

**Aufwand:** ~30 min für mv + Link-Update, ~1h für die neuen docs/-Files
zu schreiben.

### 5.6 Phase 1 Acceptance Criteria

- [ ] LICENSE existiert (✅ done, MIT)
- [ ] README.md rewrite mit OSS-Framing, badges, screenshots, quick-start,
      deploy options, license, acknowledgements
- [ ] ARCHITECTURE.md existiert mit domain model, data flow, tech rationale,
      folder structure, key abstractions, external deps, non-goals,
      open questions
- [ ] CONTRIBUTING.md existiert mit dev setup (testable mit
      fresh-clone-in-15-minutes), test instructions, code conventions,
      commit/PR process, areas for contribution
- [ ] docs/ Folder created, internal docs moved, neue WEBDB_IMPORT,
      SELF_HOSTING, MEMORY, ROADMAP files
- [ ] Cross-references in README/ARCHITECTURE/CONTRIBUTING konsistent
- [ ] Smoke-test: fresh clone in einer separaten temp-folder kann auf
      Anhieb laufen (5-10 min)
- [ ] Commit + push to main

**Phase-1 done = OSS-Release möglich.** Phasen 2-4 sind Quality-Upgrades.

### 5.7 Phase 1 Time-Budget

| Task | Aufwand |
|---|---|
| Screenshots/GIF aufnehmen | 30 min |
| README rewrite | 1.5h |
| ARCHITECTURE.md | 2-3h |
| CONTRIBUTING.md | 1.5h |
| docs/ reorg + new files | 1.5h |
| Smoke-test fresh clone | 30 min |
| Cross-reference review | 30 min |
| Commit + push | 15 min |
| **Total** | **~8h** = 1-2 Sessions |

---

## 6. Phase 2 — Folder-Reorg + Business-Logic-Extraction

### 6.1 Ziel

Die "Schlampig"-Wahrnehmung von Next.js entsteht großenteils dadurch,
dass Business-Logic in API-Routes eingebettet ist und die Boundary
zwischen Server-Code und Client-Code nur "implizit" durch `'use client'`
sichtbar ist. Phase 2 macht das explizit:

1. Klare `lib/server/` vs `lib/shared/` Trennung
2. API-Routes werden **dünne HTTP-Adapter** (≤50 LOC)
3. Business-Logic in **pure functions** in `lib/server/`
4. ESLint-Boundaries-Plugin erzwingt Import-Regeln

### 6.2 Folder-Convention (NICHT src/-wrap)

**Entscheidung gegen `src/`-Wrapping:** Würde alle Imports umstellen für
marginalen Win. Stattdessen: Konventionen INSIDE der bestehenden Folders.

**Neue lib/-Struktur:**

```
lib/
├── server/                      # Server-only — nie von Client-Components importiert
│   ├── publications/
│   │   ├── decisions.ts         # updateDecision(input) → DB + MeisterTask side-effects
│   │   ├── fetch.ts             # getPublicationById, listPublications mit filters
│   │   ├── flag.ts              # toggleFlag, listFlags
│   │   └── index.ts             # re-export
│   ├── enrichment/
│   │   ├── crossref.ts          # CrossRef API client + parser
│   │   ├── openalex.ts          # OpenAlex API client
│   │   ├── unpaywall.ts         # Unpaywall API client
│   │   ├── semantic-scholar.ts  # S2 API client
│   │   ├── pdf-extract.ts       # PDF text extraction
│   │   ├── orchestrator.ts      # enrichPublication(id) — orchestrates all sources
│   │   └── index.ts
│   ├── analysis/
│   │   ├── prompts.ts           # System prompts + few-shot examples
│   │   ├── openrouter.ts        # OpenRouter API client mit streaming
│   │   ├── score-extraction.ts  # Parse LLM response into score-shape
│   │   ├── analyze.ts           # analyzePublication(input) → score + pitch + haiku
│   │   └── index.ts
│   ├── meistertask/
│   │   ├── push.ts              # pushToMeistertask (existing in lib/meistertask)
│   │   ├── client.ts            # API client
│   │   ├── urls.ts              # buildTaskUrl
│   │   └── index.ts
│   ├── embeddings/
│   │   ├── refresh.ts           # Call refresh_embedding_pipeline RPC
│   │   └── index.ts
│   ├── review/
│   │   ├── queue.ts             # buildReviewQueue mit rank-fusion
│   │   └── index.ts
│   ├── sessions/
│   │   ├── lifecycle.ts         # create/end/list sessions
│   │   └── index.ts
│   ├── auth/
│   │   ├── gate.ts              # validatePassword, setGateCookie
│   │   └── index.ts
│   └── db.ts                    # Supabase server-client factory (Phase 3: + drizzle)
├── shared/                      # Used by client + server, no DOM APIs
│   ├── types.ts                 # ← move from lib/types.ts
│   ├── constants.ts             # ← move from lib/constants.ts
│   ├── score-utils.ts           # ← move
│   ├── html-utils.ts            # ← move
│   ├── publication-display.ts   # ← move
│   ├── enrichment-utils.ts      # DOI parsing etc.
│   ├── meistertask-urls.ts      # ← from lib/meistertask/urls.ts
│   ├── researchers-types.ts     # Leaderboard/Distribution types
│   ├── changelog.ts             # Static changelog entries
│   └── utils.ts                 # cn() and other generic
├── client/                      # Client-only — uses DOM/browser APIs
│   ├── stores/                  # localStorage-backed stores
│   │   ├── settings-store.ts    # ← move
│   │   ├── session-store.ts     # ← move
│   │   └── index.ts
│   ├── hooks/                   # React hooks
│   │   ├── use-api-query.ts     # ← move
│   │   ├── use-keyboard-shortcuts.ts  # ← move
│   │   ├── use-info-bubbles.ts        # ← move
│   │   └── index.ts
│   ├── explanations.tsx         # ← move (uses JSX so client only)
│   ├── query-keys.ts            # ← move
│   └── index.ts
└── (alte direct lib/ files migriert in server/ shared/ client/)
```

### 6.3 ESLint-Boundaries-Konfiguration

**Plugin:** `eslint-plugin-boundaries` (existing, well-maintained)

**`eslint.config.mjs` Extension:**

```javascript
import boundaries from 'eslint-plugin-boundaries';

export default [
  // ...existing config
  {
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'server', pattern: 'lib/server/**' },
        { type: 'shared', pattern: 'lib/shared/**' },
        { type: 'client', pattern: 'lib/client/**' },
        { type: 'app-pages', pattern: 'app/**' },
        { type: 'api-routes', pattern: 'app/api/**' },
        { type: 'components', pattern: 'components/**' },
        { type: 'scripts', pattern: 'scripts/**' },
      ],
    },
    rules: {
      'boundaries/element-types': ['error', {
        default: 'allow',
        rules: [
          // lib/shared can only import from itself
          { from: 'shared', allow: ['shared'] },
          // lib/server can import shared and itself
          { from: 'server', allow: ['shared', 'server'] },
          // lib/client can import shared and itself (NOT server)
          { from: 'client', allow: ['shared', 'client'] },
          // Components can import shared and client (NOT server, NOT app)
          { from: 'components', allow: ['shared', 'client', 'components'] },
          // App pages can import everything except server (server only via API)
          { from: 'app-pages', disallow: ['server'] },
          // API routes can import everything including server
          { from: 'api-routes', allow: ['server', 'shared', 'api-routes'] },
        ],
      }],
    },
  },
];
```

### 6.4 API-Route-Pattern (vor/nach)

**Vor (current, simplified example):**

```typescript
// app/api/publications/[id]/decision/route.ts (current — has business logic embedded)
export async function PATCH(req: NextRequest, { params }) {
  const { id } = await params;
  const body = await req.json();

  // Validation inline
  if (!['undecided', 'pitch', 'hold', 'skip'].includes(body.decision)) {
    return NextResponse.json({ error: 'Invalid decision' }, { status: 400 });
  }

  const supabase = getSupabaseFromRequest(req);

  // Session-create-on-decision logic inline
  let sessionId = body.decided_in_session;
  if (body.decision !== 'undecided' && !sessionId) {
    const { data: session } = await supabase
      .from('sessions')
      .insert({ started_at: new Date().toISOString() })
      .select()
      .single();
    sessionId = session.id;
  }

  // Update publication
  const { data: pub, error } = await supabase
    .from('publications')
    .update({
      decision: body.decision,
      decided_by: body.decided_by,
      decision_rationale: body.decision_rationale,
      snooze_until: body.snooze_until,
      decided_in_session: sessionId,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // MeisterTask push on pitch (inline)
  let meistertaskResult = null;
  if (body.decision === 'pitch' && !pub.meistertask_task_id) {
    try {
      meistertaskResult = await pushToMeistertask(pub);
      // Update with task_id
      await supabase.from('publications').update({
        meistertask_task_id: meistertaskResult.task_id,
        meistertask_task_token: meistertaskResult.token,
      }).eq('id', id);
    } catch (err) {
      meistertaskResult = { status: 'error', reason: err.message };
    }
  }

  return NextResponse.json({ publication: pub, meistertask: meistertaskResult });
}
```

**Nach (Phase 2):**

```typescript
// app/api/publications/[id]/decision/route.ts (Phase 2 — thin HTTP adapter)
import { updateDecision, type DecisionInput } from '@/lib/server/publications/decisions';
import { decisionPayloadSchema } from '@/lib/shared/types';

export async function PATCH(req: NextRequest, { params }) {
  const { id } = await params;
  const parsed = decisionPayloadSchema.parse(await req.json());

  const supabase = getSupabaseFromRequest(req);
  const result = await updateDecision({ pubId: id, ...parsed }, supabase);

  return NextResponse.json(result);
}
```

```typescript
// lib/server/publications/decisions.ts (Phase 2 — pure function)
import type { SupabaseClient } from '@supabase/supabase-js';
import { pushToMeistertask } from '../meistertask';
import type { Decision } from '@/lib/shared/types';

export interface DecisionInput {
  pubId: string;
  decision: Decision;
  decided_by: string;
  decision_rationale: string | null;
  snooze_until: string | null;
  decided_in_session: string | null;
}

export interface DecisionResult {
  publication: Publication;
  meistertask: MeistertaskPushResult | null;
}

export async function updateDecision(
  input: DecisionInput,
  db: SupabaseClient,  // injected for testability
): Promise<DecisionResult> {
  // Step 1: ensure session
  const sessionId = await ensureSession(input, db);

  // Step 2: update publication
  const pub = await updatePublicationRow(input, sessionId, db);

  // Step 3: side-effect on pitch
  const meistertaskResult =
    input.decision === 'pitch' && !pub.meistertask_task_id
      ? await pushOnPitch(pub, db)
      : null;

  return { publication: pub, meistertask: meistertaskResult };
}

// Private helpers — easy to test in isolation
async function ensureSession(input, db) { /* ... */ }
async function updatePublicationRow(input, sessionId, db) { /* ... */ }
async function pushOnPitch(pub, db) { /* ... */ }
```

### 6.5 API-Routes-Inventar (was Phase 2 anpackt)

**Hohe Business-Logic-Density (priorisiert):**

| Route | Geschätzter Aufwand | Notes |
|---|---|---|
| `app/api/publications/[id]/decision` | 4h | Session-create + MeisterTask push (highest complexity) |
| `app/api/analysis/batch` (SSE) | 6h | LLM-streaming, prompt-mgmt, score-extraction |
| `app/api/enrichment/batch` (SSE) | 6h | Multi-source-orchestration, error-recovery |
| `app/api/review/queue` | 3h | Rank-fusion logic (combined sort mode) |
| `app/api/meistertask/push` | 2h | Retry-logic, error-classification |
| `app/api/sessions/*` | 3h | CRUD mit auto-create |
| `app/api/publications` | 2h | Filter-query-building |
| `app/api/webdb/status` | 1h | Schema-introspection |
| `app/api/export/[format]` | 2h | Stream-CSV/JSON generation |

**Schon dünn (Phase 2 nur prüfen):**

| Route | Notes |
|---|---|
| `app/api/publications/[id]/similar-pressed` | Already minimal — wraps `similar_pressed_pubs` RPC |
| `app/api/researchers/top` | Wraps `researchers_top` RPC |
| `app/api/researchers/distribution` | Wraps RPC |
| `app/api/persons/[id]` | Mostly RPC + relations |
| `app/api/info-bubbles/[id]` | Pure lookup in EXPL map |
| `app/api/auth/gate` | Password compare + cookie set |

**Geschätzter Phase-2 Gesamt-Aufwand:** ~30h = 4-5 Sessions.

### 6.6 Migration-Order (Vorschlag)

Per-Route-Migration in dieser Reihenfolge, jeweils PR-isoliert:

1. **Setup-PR:** Create `lib/server/`, `lib/shared/`, `lib/client/`
   folders. Add eslint-plugin-boundaries config (warn-only initially).
   Empty placeholder files. **No actual code moved yet.**

2. **Migration-PR #1:** Move `lib/types.ts` → `lib/shared/types.ts`,
   `lib/constants.ts` → `lib/shared/constants.ts`, etc. (the obviously-
   shared files). Update all imports via repo-wide search-replace.
   Verify type-check passes.

3. **Migration-PR #2:** Move `lib/use-api-query.ts`, `lib/use-keyboard-
   shortcuts.ts`, `lib/use-info-bubbles.ts` → `lib/client/hooks/`. Move
   `lib/settings-store.ts`, `lib/session-store.ts` → `lib/client/stores/`.

4. **Migration-PR #3 to N:** Per high-complexity API-route, extract
   business logic into `lib/server/<feature>/`. Order:
   - First: `publications/decision` (concrete pattern reference)
   - Then: `meistertask/push`, `sessions/*` (simpler, build confidence)
   - Then: `enrichment/batch`, `analysis/batch` (SSE patterns)
   - Then: `review/queue` (rank-fusion)
   - Finally: `publications`, `export/*` (remaining)

5. **Hardening-PR:** Switch eslint-plugin-boundaries from warn → error.
   Fix any remaining violations.

### 6.7 Phase 2 Acceptance Criteria

- [ ] `lib/server/`, `lib/shared/`, `lib/client/` Folders exist mit
      klarer Trennung
- [ ] ESLint-Boundaries-Plugin konfiguriert, Rules erzwingen Import-Boundaries
- [ ] Alle 10+ API-Routes sind <50 LOC (parse → call → respond)
- [ ] Business-Logic in `lib/server/**` ist testbar mit mocked DB
- [ ] Existierende Funktionalität unverändert (Playwright e2e bleibt grün)
- [ ] ARCHITECTURE.md Folder-Section reflects new structure
- [ ] Migration-PRs klein (1 Feature/Route pro PR), nicht Big-Bang
- [ ] Type-check + Lint + e2e green nach jedem PR

---

## 7. Phase 3 — Drizzle ORM Migration

### 7.1 Ziel

Type-safe DB-Queries statt manual `as Publication[]` Casts auf
Supabase-JS-Client-Response. Wenn ein DB-Column umbenannt wird, soll TS
sofort schreien — aktuell sind viele Column-Mismatches Runtime-Errors.

### 7.2 Why Drizzle (statt Prisma, Kysely, raw)

| Library | Pros | Cons |
|---|---|---|
| **Drizzle** ✅ | SQL-near syntax, TS-first, leichtgewichtig, generates types von schema, supports pgvector via custom types, no codegen step | Newer, smaller community than Prisma |
| Prisma | Largest community, comprehensive features | Heavier, requires codegen step, Edge-runtime issues |
| Kysely | Pure type-safe SQL builder, no schema-mgmt | Manual schema-types, less ergonomic for joins |
| Raw SQL | Maximum control | No type-safety, current pain |

**Entscheidung:** Drizzle. Setup:

```bash
npm install drizzle-orm postgres
npm install -D drizzle-kit
```

### 7.3 Schema-Introspection

Drizzle kann von existing Postgres schema generieren:

```bash
# drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './lib/server/db/schema.ts',
  out: './drizzle',  // generated migrations — NOT used, see below
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

# Generate from current Postgres state
npx drizzle-kit introspect
# → ./lib/server/db/schema.ts with all tables typed
```

### 7.4 Client-Setup

```typescript
// lib/server/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const client = postgres(process.env.DATABASE_URL!, {
  max: 10,           // connection pool
  idle_timeout: 30,  // seconds
});

export const db = drizzle(client, { schema });
export * from './schema';  // re-export tables for queries
```

### 7.5 Per-Route Migration Pattern

**Vor (Supabase JS, current):**

```typescript
const { data: pub, error } = await supabase
  .from('publications')
  .select('*, press_release:press_releases(*)')
  .eq('id', id)
  .single();
```

**Nach (Drizzle):**

```typescript
import { publications, pressReleases } from '@/lib/server/db';
import { eq } from 'drizzle-orm';

const pub = await db.query.publications.findFirst({
  where: eq(publications.id, id),
  with: {
    pressRelease: true,  // Drizzle relations API
  },
});
```

### 7.6 Coexistence-Strategie

**Supabase-JS-Client behält Auth + Realtime + Storage + RPC.**

Drizzle nur für direkte DB-Queries (SELECT, INSERT, UPDATE, DELETE).
Beide Clients teilen sich die DB-Connection (Connection-Pooler verwaltet).

**Migration-Pfad pro Route:**
1. Drizzle parallel zu Supabase-JS verfügbar
2. Per Route: Refactor read-Queries first (low-risk)
3. Then: write-Queries (higher risk — RLS, triggers)
4. Wenn alle Routes migriert: Supabase-JS für DB-Queries entfernen

### 7.7 RLS + Drizzle Considerations

Aktuell: Supabase-JS-Client passt automatisch Auth-Token an → RLS feuert.

Mit Drizzle: Direkter Postgres-Connection-Pool, kein RLS by default!

**Optionen:**
A. Per-Query `SET LOCAL request.jwt.claims = '<jwt>'` für RLS-Aktivierung
B. Service-role Postgres-Connection, explicit row-level checks im Server-
   Code
C. Mix: Drizzle für non-RLS-protected reads, Supabase-JS für RLS

**Empfehlung:** B — single-tenant for now, explicit checks. RLS bleibt
für Supabase-Studio-Direct-Access. Multi-tenancy ist Phase-5+ Concern.

### 7.8 pgvector mit Drizzle

```typescript
// lib/server/db/schema.ts (partial)
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { vector } from 'drizzle-orm/pg-core/columns/vector';

export const publicationEmbeddings = pgTable('publication_embeddings', {
  publicationId: uuid('publication_id').primaryKey().references(...),
  model: text('model').notNull(),
  embedding: vector('embedding', { dimensions: 768 }).notNull(),
  computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow(),
  sourceTextHash: text('source_text_hash'),
});
```

Drizzle-orm supports `vector` column type. Cosine-distance via custom
SQL `${pe.embedding} <=> ${query}::vector`.

### 7.9 Migrations-File-Coexistence

**Supabase migrations bleiben source-of-truth.** Drizzle's
migration-system NICHT nutzen — sonst zwei concurrent migrations-trees.

Drizzle ist Query-Builder, nicht Migration-Tool in unserer Setup.
`drizzle-kit introspect` ist read-only von der Postgres-Schema.

### 7.10 Phase 3 Acceptance Criteria

- [x] `drizzle-kit introspect` produziert konsistente `lib/server/db/schema.ts`
- [x] DB-Queries in `lib/server/**` via Drizzle (read-Queries first)
- [x] TypeScript catches schema-mismatches (rename column → compile error)
- [x] Supabase-JS nur noch für Auth/Realtime/RPC/Storage (Tasks 3.12–3.21
      cleared the thin app/api/* routes; only `lib/server/db/supabase.ts`
      retains the helper exports, no caller imports them)
- [x] Migrations unchanged (still `supabase/migrations/`)
- [ ] Playwright e2e bleibt grün (running 2026-05-11 after Tasks 3.12–3.21
      — flip when the spec passes)
- [x] Test-DB-Connection-Strategy dokumentiert (Phase 4 prep) — see
      `docs/TESTING.md`

**Aufwand:** ~25h = 3-4 Sessions. Tatsächlich: ~5 Sessions (Tasks 3.0–3.21
+ Phase-2 spillover).

---

## 8. Phase 4 — Test-Coverage + CI

### 8.1 Ziel

Aktueller State: Playwright covered UI, Vitest installed aber unused.
Phase 4: Unit-Tests für `lib/server/**` und `lib/shared/**` Business-
Logic, CI auf GitHub Actions.

### 8.2 Vitest Setup

`vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
      exclude: [
        'node_modules',
        '.next',
        'app/**',          // UI covered by Playwright
        'components/**',   // UI
        'scripts/**',      // Manual scripts
        '**/*.config.*',
        '**/*.test.*',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
```

### 8.3 Test-Layout

Tests neben Source-File:
```
lib/server/publications/decisions.ts
lib/server/publications/decisions.test.ts
lib/server/enrichment/orchestrator.ts
lib/server/enrichment/orchestrator.test.ts
```

Vorteile: easy-to-find, easy-to-delete with source.

### 8.4 Mocking-Strategie

**DB:**
- **Option A: pg-mem** (in-memory Postgres in Node) — fast, no Docker
  needed. Limitations: no RLS, no triggers, partial pgvector support.
- **Option B: testcontainers** (real Postgres in Docker per test)  —
  authentic, slower (~5-10s spin-up).
- **Recommended:** Option A for unit-tests (pure function logic),
  Option B for integration-tests (full DB-round-trip).

**External APIs (CrossRef, OpenRouter, MeisterTask):**
- **MSW (Mock Service Worker)** — intercepts fetch, deterministic responses
- Setup in `vitest.setup.ts` with handlers per test file

**SPECTER2 Model:**
- Don't test directly — ML-output isn't unit-testable
- Integration-covered by Python-script CLI invocation in CI

### 8.5 Test-Examples

```typescript
// lib/server/publications/decisions.test.ts
import { describe, it, expect, vi } from 'vitest';
import { updateDecision } from './decisions';
import { createMockDb } from '../testing/mock-db';

describe('updateDecision', () => {
  it('creates session lazily when decision != undecided and no session_id given', async () => {
    const db = createMockDb();
    const result = await updateDecision(
      {
        pubId: 'pub-1',
        decision: 'pitch',
        decided_by: 'maria',
        decision_rationale: null,
        snooze_until: null,
        decided_in_session: null,
      },
      db,
    );

    expect(db.calls.sessions.insert).toHaveBeenCalledOnce();
    expect(result.publication.decision).toBe('pitch');
  });

  it('triggers MeisterTask push on pitch but not on hold', async () => {
    // ...
  });

  it('reuses existing session_id when provided', async () => {
    // ...
  });

  it('handles MeisterTask error gracefully (decision still saved)', async () => {
    // ...
  });
});
```

### 8.6 CI Workflow

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-type-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17.6
        env:
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx eslint .
      - run: npm test
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/postgres

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run dev &
      - run: sleep 30 && npx playwright test
```

### 8.7 Coverage-Targets

Per-Folder:
- `lib/server/**` — 80%+ coverage (business logic)
- `lib/shared/**` — 90%+ coverage (pure utility, easy to test)
- `lib/client/**` — 60%+ (some are React hooks, harder)

Per-Critical-Function:
- `updateDecision` — 100% (state machine + side effects)
- Enrichment orchestrator — 90% (error paths critical)
- Score extraction — 100% (parsing must be deterministic)

### 8.8 Phase 4 Acceptance Criteria

- [ ] Vitest setup with working test runner
- [ ] Example tests for 5+ `lib/server/` functions
- [ ] Example tests for 3+ `lib/shared/` utilities
- [ ] MSW setup for external-API mocking
- [ ] CI workflow runs on every PR + main push
- [ ] Coverage report posted as PR comment (e.g. via `codecov` action)
- [ ] CONTRIBUTING.md documents how to write new tests
- [ ] Coverage >70% on `lib/server/**`, >85% on `lib/shared/**`

**Aufwand:** ~25h = 3-4 Sessions.

---

## 9. Cross-Cutting Concerns

### 9.1 Was bleibt
- Next.js + Supabase + React + Tailwind + shadcn/ui Stack
- SPECTER2-Embedding-Pipeline (Python, offline batch)
- Component-Library (TintBadge, SectionLabel, etc.)
- Existing migrations (chronological + immutable)
- Playwright e2e
- Memory-Files in `~/.claude/projects/-home-mleihs-dev-oeaw-press-release/memory/`
- The 3 user-facing personas: PR-Team, Reviewer, Admin (no role-system yet)

### 9.2 Was NICHT in diesem Plan
- **Kein Phoenix/FastAPI-Rewrite** — separates Projekt wenn nötig
- **Keine neuen externen Dependencies** ohne explicit-Begründung
- **Keine Breaking-Changes** an existierenden migrations (immutable)
- **Kein UI-Redesign** (Phase 1-4 sind über Architektur, nicht UX)
- **Keine i18n** (separate Issue, separate Phase)
- **Kein Real-Time-Multi-User** (Trigger für Phoenix-Rewrite)
- **Kein Multi-Tenancy** (separates Projekt)

### 9.3 Risiken

**Phase 2 Folder-Reorg könnte massive Import-Changes triggern**
- Mitigation: Per-PR-per-Feature migrieren, nie Big-Bang
- Fallback: Wenn ein PR zu groß wird, splitten

**Phase 3 Drizzle könnte RLS-Policies stören**
- Mitigation: Read-Queries first, Write-Queries vorsichtig
- Fallback: Per-Route-Migration mit feature-flag (Supabase-JS oder Drizzle)

**Phase 4 Test-Setup könnte CI-time signifikant erhöhen**
- Mitigation: Parallel jobs, dep-cache, run only on PR not push-to-feature
- Fallback: Skip e2e on PR, only on main-merge

**Vercel-Cost könnte mit Test-Workflows steigen**
- Migration to GitHub Actions (already planned in Phase 4) löst das

### 9.4 OSS-Release-Checklist (vor Public-Visibility)

Vor dem repo-public-flip checken:
- [ ] Keine credentials in commit-history (`git secrets` scan)
- [ ] `.env.local.example` enthält alle benötigten Vars ohne values
- [ ] README.md hat real-world quick-start ohne ÖAW-spezifika
- [ ] LICENSE existiert
- [ ] CODE_OF_CONDUCT.md existiert (Phase 1 add-on)
- [ ] SECURITY.md für vulnerability-reporting
- [ ] CONTRIBUTORS.md / credits in README
- [ ] No ÖAW-internal urls/paths in code
- [ ] Memory files in `~/.claude/...` bleiben PRIVAT (nicht im repo)
- [ ] GitHub-Issue-templates configured
- [ ] GitHub-PR-template configured
- [ ] Branch-protection auf main (require PR, require status checks)

### 9.5 Performance-Notes (current, for ARCHITECTURE.md)

Performance characteristics worth documenting:
- `/review` initial render: ~22s on memory-pressed runner (queue API
  fetches 38k pubs + ranking)
- Embedding compute: ~3.2s/pub on CPU (first run), sub-second for cached
- press_similarity refresh: ~26s for n=7375 with k=5
- IVFFlat probes=50 forced: ~1% recall improvement vs default probes=1
- TYPO3-WebDB-Import: ~1min for 37k publications + junctions
- SSE-stream from /api/enrichment/batch: 500ms-2s per pub (network bound)
- Playwright visual.spec.ts full run: ~4 min for 26 snapshots

---

## 10. Memory-Files Referenz

Location: `~/.claude/projects/-home-mleihs-dev-oeaw-press-release/memory/`

Vollständige Liste (Stand 2026-05-11) — diese Files enthalten den
kumulativen Decision-Log über mehrere Sessions:

### Project Context
- `project_overview.md` — OeAW press triage; mid-Phase 0.5 → filter UX
- `webdb_data_model.md` — TYPO3 source, webdb_uid natural key, ETL script
- `etl_doi_fallback.md` — DOIs in 14 Feldern, URL-Slug-Heuristik
- `import_pipeline_followups.md` — IMMER enrich-free --apply nach import
- `candidates_filter_freshness.md` — --api-enriched zieht alte Pubs vor

### Production Safety
- `production_db_safety.md` — Local IS canonical, ETL non-destructive
- `prod_haiku_drift.md` — Direct-psql-UPDATE touched updated_at NICHT
- `prod_deployment_setup.md` — Pooler URL, docker-exec pg_dump, BYOK
- `prod_db_url_location.md` — ~/.config/oeaw-press-release/prod-credentials
- `local_supabase_ports.md` — shifted to 544xx for coexistence
- `lead_author_recovery_2026-05-05.md` — bad-backfill recovery via temp-MySQL

### Scoring & Embeddings
- `press_score_alignment_finding.md` — CV-AUC 0.85, V2 formula recommended
- `llm_dimensions_multicollinearity.md` — VIF 12-32, halo effect
- `iqoqi_reputation_blind_spot.md` — 7/10 false-negatives are quantum
- `centroid_vs_knn_lesson.md` — k-NN top-5 > centroid by ΔAP +0.049
- `methodology_papers_correct_citations.md` — corrected paper citations
- `mahighlight_semantics.md` — Eigen-Highlight (NICHT Akademie)
- `webdb_title_truncation.md` — Subtitle nach `:` fehlt im title-Feld

### UI / UX Decisions
- `dark_mode_token_conventions.md` — Mapping-Tabelle für tokens
- `filter_ui_decisions.md` — press-eligibility default, ITA bias not exclusion
- `scoring_reasoning_style.md` — Fließtext nur, keine Variablennamen
- `pitch_angle_craft.md` — Story-Anker statt Headline-Zahl
- `publication_evaluation_rules.md` — keine Titel-only-Bewertung
- `feedback_substanz_vs_pitchbar.md` — 4 Sanity-Fragen vor Score
- `scoring_session_workflow.md` — Batches durchrennen lassen
- `haiku_discipline.md` — drei Niemals-Regeln
- `session_quality_drift.md` — Substanz vor Geschwindigkeit

### Workflow & Collaboration
- `user_preferences.md` — German-first, opinionated picks, ultrathink
- `feedback_apply_pacing.md` — Block statt File, status pro Hebel
- `wsl2_oom_risk.md` — heap-cap 1.5 GB, 3-loop cycle

### Pointers to Repo Docs
- `in_flight_handover.md` — points to HANDOVER.md
- `tech_handover_pointer.md` — points to TECH_HANDOVER.md
- `editorial_pipeline_proposal.md` — pitch_log + coverage Tabellen
- `story_bundles_proposal.md` — stories Entity, semantic bundling
- `meistertask_integration.md` — MVP shipped 2026-04-29

### Action für Phase 1
Subset von Memory in **`docs/MEMORY.md`** kuratieren — anonymisierte
Decision-Log für externe Contributors. Nicht alles dort hin (manches ist
internal-only), sondern selektiv: design-Entscheidungen, Trade-offs,
„Why we did X instead of Y".

---

## 11. Wie hier nach /clear weitermachen

**Onboarding für Fresh-Context-Session (5 Minuten):**

```bash
# 1. Lese diesen Plan komplett
cat OSS_READINESS_PLAN.md  # ~1300 LOC

# 2. Check git log auf neueste Commits
git log --oneline -15

# 3. Check uncommitted state
git status

# 4. Check welche Phase als nächstes
# Schau in §5, §6, §7, §8 Acceptance Criteria — was ist noch nicht abgehakt?

# 5. Memory files lesen für Context
ls ~/.claude/projects/-home-mleihs-dev-oeaw-press-release/memory/

# 6. Confirm mit User welche Phase und welches konkretes Item starten
# Beispiel: "Starting Phase 1, beginning with README.md rewrite per §5.2"
```

### Phase-1-Starting-Point Detail

**Reihenfolge der Phase-1-Tasks** (mit konkreten Aktionen):

**Task 1.1 — Setup Screenshots (30 min)**
```bash
npm run dev
# Browser-Screenshots:
#   /                          — Dashboard mit allen widgets
#   /review                    — Triage queue mit decision-toolbar expanded
#   /publications              — Filter sheet open
#   /publications/[some-id]    — Detail mit press-reference-card
#   /researchers               — Spotlight + Leaderboard
# Save zu public/screenshots/
# Optional: Loom-Recording für Triage-Workflow GIF
```

**Task 1.2 — README rewrite (1.5h)**
Skelett aus §5.2. Concrete actions:
- Copy current README.md to docs/old-README.md as reference
- Write new README.md with structure from §5.2
- Link screenshots
- Smoke-test the quick-start commands on a fresh `/tmp/test-clone` dir

**Task 1.3 — ARCHITECTURE.md (2-3h)**
Skelett aus §5.3. Major sections — write in this order:
1. Domain Model (use diagram from §3.3)
2. Data Flow (use diagram from §3.4)
3. Tech Stack Rationale (use rationales from §1.2)
4. Folder Structure (use §3.1)
5. Key Abstractions (use §3.5 + §3.6)
6. External Dependencies (use §3.2)
7. Non-Goals
8. Open Architectural Questions (use §9.5 + memory references)

**Task 1.4 — CONTRIBUTING.md (1.5h)**
Skelett aus §5.4. Smoke-test the dev setup section by:
- Run `git clone` in a fresh `/tmp/test-contributor/`
- Follow CONTRIBUTING.md step-by-step
- Adjust für jede Stelle wo man hängenbleibt

**Task 1.5 — docs/ reorganization (1.5h)**
- `mkdir -p docs`
- `git mv` for: HANDOVER.md, TECH_HANDOVER.md, IMPLEMENTATION.md,
  PROD_SETUP_PLAN.md, TRIAGE_LOOP_PLAN.md, RESEARCHERS_PLAN.md,
  BEWERTUNGS_RUBRIK.md → docs/
- Update any links in README/ARCHITECTURE/CONTRIBUTING
- Create new docs:
  - `docs/WEBDB_IMPORT.md` — TYPO3 schema mapping (extract from
    TECH_HANDOVER.md + webdb_data_model.md memory)
  - `docs/SELF_HOSTING.md` — Docker compose, nginx, separate Postgres
  - `docs/SCORING_VALIDATION.md` — Empirical findings (from
    press_score_alignment_finding.md memory)
  - `docs/MEMORY.md` — Curated subset of memory-files for public
  - `docs/ROADMAP.md` — Feature roadmap + known limitations

**Task 1.6 — Cross-reference review (30 min)**
- README → ARCHITECTURE? ✓
- README → CONTRIBUTING? ✓
- ARCHITECTURE → CONTRIBUTING? ✓
- All docs/* linked from README? ✓
- No broken internal links (vscode-extension oder script-check)

**Task 1.7 — Commit + Push (15 min)**
Commit message:
```
docs: OSS-readiness foundation — README, ARCHITECTURE, CONTRIBUTING

Phase 1 of the OSS_READINESS_PLAN.md cleanup:
- README.md komplett rewrite mit OSS-framing, badges, screenshots
- ARCHITECTURE.md neu für Contributors (domain, data flow, conventions)
- CONTRIBUTING.md neu mit dev-setup + code-conventions + PR-process
- docs/ folder für interne Handover-Docs
- LICENSE MIT (existed)
- docs/WEBDB_IMPORT.md, SELF_HOSTING.md, MEMORY.md, ROADMAP.md neu
```

### Phase-2 Starting-Point Detail

Wenn Phase 1 done und User Phase 2 ankickt:

**Task 2.0 — Setup-Branch + ESLint-Boundaries (1h)**
- Branch `chore/phase-2-folder-setup`
- Install `eslint-plugin-boundaries`
- Add to `eslint.config.mjs` per §6.3
- Configure as warn-level (not error yet)
- Create empty `lib/server/`, `lib/shared/`, `lib/client/` folders with `.gitkeep`
- PR + merge

**Task 2.1 — Move shared utilities (2h)**
- Branch `refactor/move-shared-utilities`
- Move: `lib/types.ts` → `lib/shared/types.ts`
- Move: `lib/constants.ts` → `lib/shared/constants.ts`
- Move: `lib/utils.ts` → `lib/shared/utils.ts`
- Move: `lib/score-utils.ts` → `lib/shared/score-utils.ts`
- Move: `lib/html-utils.ts` → `lib/shared/html-utils.ts`
- Move: `lib/publication-display.ts` → `lib/shared/publication-display.ts`
- Update imports via search-replace (`@/lib/types` → `@/lib/shared/types`)
- Verify `npx tsc --noEmit` + `npx eslint .`
- PR + merge

**Task 2.2 — Move client utilities (2h)**
Similar pattern für client-only stores + hooks.

**Tasks 2.3+ — Per high-complexity route, business-logic extraction**
Folge §6.4 pattern. Order from §6.6:
- First: `publications/decision`
- Then: simpler routes (`meistertask/push`, `sessions/*`)
- Then: complex SSE routes (`enrichment/batch`, `analysis/batch`)
- Then: ranking-logic (`review/queue`)
- Then: remaining

Each as separate PR.

### Phase-3 Starting-Point Detail

When Phase 2 done und Phase 3 starts:

**Task 3.0 — Install Drizzle + introspect (1h)**
```bash
npm install drizzle-orm postgres
npm install -D drizzle-kit
```
Add `drizzle.config.ts` per §7.3. Run `npx drizzle-kit introspect`.
Move generated schema to `lib/server/db/schema.ts`. Add `lib/server/db/index.ts` with client export.

**Tasks 3.1+ — Per-route migration**
Read-Queries first. Pattern from §7.5.

### Phase-4 Starting-Point Detail

When Phase 3 done:

**Task 4.0 — Vitest + MSW setup (2h)**
Install + configure per §8.2-§8.4.

**Tasks 4.1+ — Per-module test writing**
Aim for 70%+ coverage per §8.7.

**Task 4.N — CI workflow (1h)**
`.github/workflows/ci.yml` per §8.6.

---

## 12. Open Questions

### Vor Phase-1-Start klären

- [ ] **License confirmation:** MIT ist gesetzt (LICENSE file). Alternative wäre
      Apache 2.0 mit expliziter Patent-Klausel (wichtiger für Konzerne, weniger
      für Universitäten). MIT bleibt empfohlen.
- [ ] **Repo-Visibility-Timing:** Wann soll repo public werden? Vor oder nach
      Phase 1? Empfehlung: nach Phase 1 (sonst sieht erster Eindruck rough aus).
- [ ] **App-Branding:** „StoryScout" als Name behalten? Oder generisch
      „press-triage-tool"? StoryScout ist memorabel + greifbar.
- [ ] **Acknowledgements:** Wer als Contributors? Mindestens: mleihs als
      primary author, ÖAW als sponsor. Andere Beiträger?
- [ ] **Repo-URL:** Aktuelle origin ist `github.com/mleihs/oeaw-press-relevance`
      (private). Wenn public — auf ÖAW-org-Account ziehen oder bei mleihs lassen?
- [ ] **Issue-Tracker-Setup:** Issue-Templates für Bug/Feature/Question?
- [ ] **GitHub-Discussions:** Enable für Community-Fragen?

### Vor Phase-2-Start klären

- [ ] **`src/`-Wrapping:** Plan empfiehlt KEINE src/-Wrappung. Bestätigen?
- [ ] **Function-Granularität:** Wie fein soll `lib/server/X/Y.ts` splitten?
      Empfehlung: 1 file pro feature-area, mit private helpers im gleichen file.
- [ ] **Zod for validation:** Aktuell teilweise inline validation. Einheitlich
      Zod-Schemas in `lib/shared/schemas.ts`? Empfehlung: ja.

### Vor Phase-3-Start klären

- [ ] **Drizzle vs Kysely:** Final-Entscheidung (Plan favorisiert Drizzle).
- [ ] **RLS-coexistence:** Service-role Connection + explicit checks
      (Option B in §7.7)? Oder RLS via JWT-claim-set (Option A)?
- [ ] **Migrations-Source:** Bestätigen — Supabase migrations bleiben source,
      Drizzle nur Query-Builder.

### Vor Phase-4-Start klären

- [ ] **CI-Provider:** GitHub Actions (default für public repo) oder anderer?
- [ ] **Coverage-Tool:** v8 (in-build vitest) oder external (codecov)?
- [ ] **e2e-in-CI:** Playwright in CI mit headless chromium, oder nur
      Unit-Tests in CI + e2e nur lokal? Empfehlung: e2e in CI auf main-merge
      only, nicht PR (zu slow).

---

## Schluss

Dieser Plan ist vollständig genug für **Phase-1-Start ohne Rückfragen**.

Phasen 2-4 brauchen jeweils einen **eigenen Plan-Refinement-Step** vor
Beginn — die Pattern + Acceptance-Criteria sind hier definiert, aber
die concrete file-by-file Migration-Liste sollte zu Phase-Beginn frisch
gegen den dann-aktuellen Codebase-State erstellt werden.

**Nächster Schritt** (nach /clear oder direkt):
→ Phase 1 starten, beginnend mit Task 1.1 (Screenshots) oder Task 1.2 (README).

**Letzte Empfehlung:** vor Phase-1-Commit den Plan auch reviewen und
Feedback ergänzen — der Plan ist living document.
