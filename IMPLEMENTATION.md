# OeAW Press Relevance Analyzer — Implementation Documentation

**Version**: 2.0 (post-relational refactor)
**Last refresh**: 2026-04-29
**Stack**: Next.js 16.2 / React 19.2 / TypeScript 6.0 / Supabase (RLS + Service-Role) / OpenRouter / Tailwind CSS 4 / Vitest

> **Important**: This document was rewritten 2026-04-29 after a series of audit
> waves (A–F + G1–G4 + H1) and feature additions (Researchers, InfoBubble,
> hybrid filter, WebDB ETL). The 1.0 version (2026-02) described a single-flat-
> table architecture; that model was replaced by a relational schema in commit
> `f134fb5` (WebDB ETL). For the deepest dive into individual subsystems,
> follow the cross-references — this doc is an entry point, not a complete
> duplicate of code-as-truth. When in doubt, the code wins.

> **Audit history (2026-04-29)**: see commits `5f15503` (Wave A: Foundation +
> Security + Correctness), `e2d1bcb` (Wave B: A11y bulk-fix WCAG 2.2 AA),
> `303945e` (Wave C: DRY + Cleanup), `164eec2` (Wave D: Performance + DB),
> `7bbbc95` (Wave E: error/loading/not-found boundaries), `e935778` (Wave F:
> Patch deps), G1–G4 (auth gate, apiError rollout, publication_score_stats,
> useDeferredValue + SCORE_WEIGHTS single source), `3fff8fc` (H1: AppSettings
> cleanup + ScoreDimension type + x-llm-model header weg), `9fba2e9` (H2:
> Vitest + 11 tests).

---

## Table of Contents

1. [Architecture at a glance](#1-architecture-at-a-glance)
2. [Source-of-truth map](#2-source-of-truth-map)
3. [Database schema (relational)](#3-database-schema-relational)
4. [API surface](#4-api-surface)
5. [Library layer](#5-library-layer)
6. [Test layer](#6-test-layer)
7. [Auth gate](#7-auth-gate)
8. [Data pipelines](#8-data-pipelines)
9. [Researchers feature (Forscher:innen-Ranking)](#9-researchers-feature-forscherinnen-ranking)
10. [InfoBubble system](#10-infobubble-system)
11. [Hybrid filter pattern](#11-hybrid-filter-pattern)
12. [Title-truncation heuristic](#12-title-truncation-heuristic)
13. [Configuration & deployment](#13-configuration--deployment)
14. [Migration rollback strategy](#14-migration-rollback-strategy)
15. [Porting notes (historical)](#15-porting-notes-historical)
16. [MeisterTask integration](#16-meistertask-integration)

---

## 1. Architecture at a glance

Single Next.js 16 App-Router project. Three layers:

- **Postgres is the real backend.** Aggregation, ranking, sparkline generation,
  Bayessche Glättung, score-band classification all live as
  `LANGUAGE sql STABLE` functions in `supabase/migrations/*.sql`. API routes
  are thin Zod-validated wrappers around `supabase.rpc(...)`.
- **Next.js API routes** handle all mutations and the LLM-call coordination
  (enrichment pipeline, analysis batch). SSE streaming for the long jobs.
- **Client UI** is `nuqs`-bound: filter state lives in the URL, not in a
  global store. Co-located routing privates per page (`_components`, `_hooks`,
  `_filters`).

```
TYPO3 WebDB (mysqldump.sql.gz)
  └─ scripts/webdb-import.mjs ─→ Supabase (relational tables)
                                  ├─ Enrichment (CrossRef → OpenAlex →
                                  │                Unpaywall → Semantic Scholar
                                  │                → PDF → WebDB-native)
                                  └─ LLM scoring (OpenRouter / claude-code session)
                                       └─→ writes back press_score + 5 dim
                                           scores + pitch + angle + reasoning
                                           + haiku per publication
```

The `publications` table is the central row, joined to `persons`, `orgunits`,
`projects`, `oestat6_categories` via M:N junction tables.

---

## 2. Source-of-truth map

Where each kind of fact lives. When in doubt, edit the source listed here —
this doc gets stale, the code does not.

| Topic | Authoritative source |
|---|---|
| DB schema, indices, Postgres functions | `supabase/migrations/*.sql` (chronological) |
| Score weights | `lib/score-weights.json` (consumed by both UI and `scripts/session-pipeline.mjs`) |
| Score-band thresholds (0.7 high, 0.4 mid) | `lib/constants.ts` + mirrored in PG functions |
| Metric / filter explanations shown in tooltips | `lib/explanations.tsx` (`EXPL` map) |
| Researchers feature design | `RESEARCHERS_PLAN.md` |
| Filter preset behavior, modifier semantics | `app/publications/_filters.ts` + `_constants.ts` |
| WebDB-title truncation heuristic | `lib/html-utils.ts:displayTitle` (memory: `webdb_title_truncation.md`) |
| Mahighlight semantics | `lib/explanations.tsx:mahighlight_self` (memory: `mahighlight_semantics.md`) |
| Auth flow | `middleware.ts` + `app/api/auth/gate/route.ts` |
| Migration rollback strategy | `supabase/ROLLBACK.md` |
| Test coverage (current scope) | `lib/scoring.test.ts`, `lib/html-utils.test.ts`, `app/publications/_constants.test.ts` |
| Bayes-smoothing JS port (matches PG `weighted_avg`) | `lib/scoring.ts:bayesSmooth` |
| Press-score formula JS port | `lib/scoring.ts:computePressScore` |

---

## 3. Database schema (relational)

Schema went from "single flat publications table" (v1.0, 2026-02) to a proper
relational model in `f134fb5` (WebDB ETL, 2026-04-27). Authoritative source:
`supabase/migrations/*.sql`.

### Core tables

- **`publications`** — central row; ~40 columns covering identity (`webdb_uid`,
  `doi`), WebDB metadata (`title`, `summary_de/en`, `citation_apa/de/en/bibtex/ris/endnote`,
  `peer_reviewed`, `popular_science`, `archived`), enrichment state
  (`enriched_abstract`, `enriched_keywords`, `enriched_journal`,
  `enriched_source`, `full_text_snippet`, `word_count`), and LLM analysis
  (`press_score`, 5 dimension scores, `pitch_suggestion`, `suggested_angle`,
  `target_audience`, `reasoning`, `haiku`, `llm_model`, `analysis_cost`).
- **`persons`** — researchers (`firstname`, `lastname`, `degree_before/after`,
  `email`, `orcid`, `oestat3_name_de/en`, `external`, `deceased`, `portrait`,
  `slug`, `member_type_id`).
- **`orgunits`** — institutional tree (`name_de`, `akronym_de`, `parent_id` for
  recursive hierarchy, `type_id` → `orgunit_types`).
- **`projects`** — research projects (`title`, `summary`, `thematic_focus`,
  `funding_type`, `starts_on/ends_on`, `cancelled`).
- **`lectures`** — public talks (`lecture_date`, `city`, `event_name`,
  `popular_science`).
- **`oestat6_categories`** — Austrian 6-digit science classification (~1411
  codes, `oestat3` = uid / 1000).
- Lookup tables: `publication_types`, `orgunit_types`, `member_types`,
  `lecture_types`, `extunits`.

### Junction tables (M:N)

- `person_publications (person_id, publication_id, authorship, highlight, mahighlight)`
- `person_orgunits (person_id, orgunit_id)` — current state only, no temporal
  versioning (known limitation: a researcher's history pre-affiliation-change
  is mis-attributed to current orgunit)
- `orgunit_publications (orgunit_id, publication_id, highlight)`
- `publication_projects`, `publication_oestat6s`, `lecture_persons`,
  `lecture_orgunits`

### Materialized view

`publication_oestat6_matview` (migration `20260427000004`) — pre-computed
pub × oestat6 join for faster domain-level filtering. Refresh policy not yet
documented; this MV pre-dates the "no MVs in MVP" leitprinzip in
`RESEARCHERS_PLAN.md`. **TODO**: document refresh strategy or remove if no
longer load-bearing.

### Postgres functions

Called via `supabase.rpc(...)`:

- **`top_researchers(p_since, p_metric, p_authorship_scope, p_oestat3_ids,
  p_include_external, p_include_deceased, p_member_only, p_min_value,
  p_exclude_ita, p_exclude_outreach, p_limit)`** — leaderboard with rank,
  delta, is_newcomer, sparkline, top_pub jsonb (incl. citation).
- **`researcher_distribution(...)`** — flattened points for the Beeswarm.
- **`researcher_detail(p_person_id, p_since, p_exclude_ita, p_exclude_outreach)`**
  — person, stats, activity histogram (24 monthly bands), coauthors, publications.
- **`publication_score_stats(p_since)`** — score-distribution buckets +
  dimension averages for the dashboard.
- **`pub_ids_by_oestat6(...)`**, **`pub_ids_by_highlight(...)`** — filter helpers.

### RLS lockdown

Migration `20260428000010_rls_lockdown.sql` enabled RLS with permissive policies
(single-user-tool semantics; mutations gated server-side via service-role key
in `getSupabaseAdmin()`).

---

## 4. API surface

All routes are gated by `middleware.ts`; unauthenticated calls get 401 JSON.
Server-side uses env-bound credentials exclusively (no client-side Supabase
header overrides — closed by audit B2 + H1).

### Reads (gated, env-credentialed)

| Route | Purpose | Backed by |
|---|---|---|
| `GET /api/publications` | List + filter + `stats=true` mode | direct queries + filter-helper RPCs |
| `GET /api/publications/[id]` | Single pub with relations | direct query |
| `GET /api/researchers/top` | Leaderboard | RPC `top_researchers` |
| `GET /api/researchers/distribution` | Beeswarm points | RPC `researcher_distribution` |
| `GET /api/persons/[id]` | Person profile + stats + activity | RPC `researcher_detail` |
| `GET /api/orgunits` | Orgunit tree (lookup) | direct query |
| `GET /api/publication-types` | Type enum (lookup) | direct query |
| `GET /api/oestat6` | Oestat6 categories (lookup) | direct query |
| `GET /api/webdb/status` | ETL sync status | direct query |
| `GET /api/export/csv` | Filtered CSV export | direct query |
| `GET /api/export/json` | Filtered JSON export | direct query |

### Mutations (use `getSupabaseAdmin()` service-role bypass)

| Route | Purpose |
|---|---|
| `POST /api/publications/import` | Bulk insert from CSV (chunks of 100) |
| `POST /api/enrichment/batch` | SSE-streaming enrichment (CrossRef → OpenAlex → Unpaywall → Semantic Scholar → PDF → WebDB-native) |
| `POST /api/analysis/batch` | SSE-streaming LLM evaluation via OpenRouter |

### Auth

| Route | Purpose |
|---|---|
| `POST /api/auth/gate` | Login: validates `GATE_PASSWORD`, sets HttpOnly `gate` cookie |
| `DELETE /api/auth/gate` | Logout (clears cookie) |

### Per-request header overrides (client → server)

The only remaining client→server header is `x-openrouter-key` — a legitimate
"bring your own key" pattern for users who want to own their OpenRouter cost.
The `x-llm-model` header is set per-batch directly by `AnalysisModal` (no longer
by `getApiHeaders()`); model selection is per-batch, not a global pref.

---

## 5. Library layer

**`lib/types.ts`** — all TypeScript interfaces. Key types: `Publication`,
`PublicationWithRelations` (with `authors_resolved`, `orgunits`, `projects`),
`Person`, `Orgunit`, `Project`, `EnrichmentResult`, `AnalysisResult`,
`PublicationStats`, `AppSettings` (only `openrouterApiKey`, `minWordCount`,
`batchSize` after H1 cleanup).

**`lib/constants.ts`** — `PUBLICATION_TYPE_MAP`, `OA_TRUE/FALSE_VALUES`,
`SCORE_WEIGHTS` typed with `satisfies Record<ScoreDimension, number>` (a
broken `score-weights.json` becomes a typecheck error, not a runtime
surprise), `SCORE_DIMENSIONS` (the const tuple driving display order),
`SCORE_COLORS`, `SCORE_LABELS`, `SCORE_BAND_HIGH = 0.7`, `SCORE_BAND_MID = 0.4`,
`SOURCE_LABELS / BADGE_CLASSES / DESCRIPTIONS`, `LLM_MODELS`.

**`lib/scoring.ts`** — pure JS port of two formulas: `bayesSmooth(n, avg,
prior, k=3)` mirrors the PG function from
`20260428000008_researchers_weighted_avg.sql`; `computePressScore(dimensions)`
mirrors the SQL aggregation. Both covered by `lib/scoring.test.ts` so a
`score-weights.json` edit can't silently drift.

**`lib/explanations.tsx`** — `EXPL` map, ~40 entries. Central source of truth
for every UI tooltip ("what does this number mean / how was it computed?")
via `<InfoBubble id="..." />`. Editing wording in one place updates Spotlight,
Table, Detail, Dashboard, Researchers — no drift.

**`lib/html-utils.ts`** — `decodeHtmlTitle` (HTML entities + `<SUP>/<SUB>` →
Unicode super/subscript) and `displayTitle` (citation-based subtitle extension
for WebDB-truncated titles). Tested in `lib/html-utils.test.ts`.

**`lib/researchers.ts`** — type defs for the leaderboard surface
(`LeaderboardMetric`, `AuthorshipScope`, `TopResearcherRow`,
`DistributionPoint`, `ResearcherDetail`), `METRIC_LABELS`, `SINCE_PRESETS`.

**`lib/api-helpers.ts`** — `getSupabaseFromRequest` (env-only),
`getSupabaseAdmin` (service-role for mutations), `getOpenRouterKey`
(env-priority + header fallback), `getLLMModel` (env `LLM_DEFAULT_MODEL`
fallback before hardcode), `createSSEStream`, `apiError`.

**`lib/supabase.ts`** — `getSupabaseClient()` (browser-side, env-only after
H1) and `createServerClient(url, key)` (server-side wrapper).

**`lib/settings-store.ts`** — localStorage settings (only OpenRouter-Key + UI
prefs `minWordCount` / `batchSize` after H1) + `getApiHeaders()` (sends
Content-Type + optional `x-openrouter-key` only).

**`lib/csv-parser.ts`** — PapaParse + WebDB header → schema mapping +
3-layer dedup (title + DOI + UID).

**`lib/use-info-bubbles.ts`**, **`lib/use-keyboard-shortcuts.ts`** — UI hooks
(global tooltip toggle, ⌘K / search shortcuts, J/K-style page nav).

**`lib/enrichment/`** — 6 source-specific fetchers (`crossref`, `openalex`,
`unpaywall`, `semantic-scholar`, `pdf-extract`, `webdb-native`). Each returns
`EnrichmentResult | null`. Pipeline orchestration in
`app/api/enrichment/batch/route.ts`.

**`lib/analysis/openrouter.ts`** + **`lib/analysis/prompts.ts`** — LLM call
coordination + system/evaluation prompt templates.

---

## 6. Test layer

`vitest` with Node environment (no jsdom — pure unit tests).

- **`lib/scoring.test.ts`** — `bayesSmooth` (1-pub-wonder pulled to prior, many
  pubs converge to own avg), `computePressScore` (all-1s → 1.0; mixed input
  → documented weighted formula), `SCORE_WEIGHTS` sum = 1.0.
- **`lib/html-utils.test.ts`** — `decodeHtmlTitle` (SUP/SUB → Unicode + entity
  decoding + tag-strip + whitespace collapse), `displayTitle` (null citation,
  prefix-match extension, no-match unchanged).
- **`app/publications/_constants.test.ts`** — pin of
  `ELIGIBILITY_EXCLUDE_TYPE_UIDS = [5, 7, 8, 13, 15, 19, 23]`. The list is
  duplicated server-side in `app/api/publications/route.ts:15`; this test
  catches drift on the client side.

Run: `npm test` (run-once, CI-style) or `npm run test:watch`.

**Not yet covered**: PG functions themselves (would need pg-tap or an
integration-test setup against a local Supabase) and React components (would
need jsdom + @testing-library/react). The first test layer targets the pure
logic that can be wrong without a DB.

---

## 7. Auth gate

Middleware-based (`middleware.ts`, since G1 / commit `23d27f3`).

Login flow:
1. `POST /api/auth/gate` with `{ password }` validates against `GATE_PASSWORD`
   env var.
2. On success, sets HttpOnly `gate` cookie containing SHA-256 of the password.
3. Pre-computed `GATE_TOKEN = sha256(GATE_PASSWORD)` lives in env so the
   middleware can compare without hashing per request.
4. Middleware blocks all non-public paths if cookie missing or doesn't match.
5. API requests get 401 JSON; page requests redirect to `/` (where the gate
   UI lives).

**Public paths** (no gate): `/api/auth/gate`, `/robots.txt`, `/favicon.ico`,
`/_next/*`, `/capybara*.png`.

If `GATE_TOKEN` isn't set in env, middleware passes through (dev mode); the
client-side `<PasswordGate>` component is the fallback UI.

**Multi-user state**: schema foundation exists (`users` + `user_settings`
tables, migration `20260429000004_users_stub.sql`) but no UI is wired yet.
RLS is enabled with no policies — only the service-role client can write.
Next step: Supabase Auth integration + per-row policies keyed on
`auth.uid() = id`, then move localStorage AppSettings reads/writes to the
DB-backed `user_settings`. Today the single-password-gate continues to be
the only auth boundary.

---

## 8. Data pipelines

### WebDB relational ETL (the only ingest path)

`scripts/webdb-import.mjs` reads a TYPO3 mysqldump (`*.sql.gz`), decompresses
with `mysql2`, walks TYPO3 table prefixes (publications, persons, orgunits,
projects, junctions), normalizes IDs to UUIDs, upserts into Supabase keyed on
`webdb_uid`. Idempotent — re-runs only update changed rows.

Status visible in the UI: `GET /api/webdb/status` → counts + last-synced
timestamp shown on `/upload`.

### Enrichment pipeline

`POST /api/enrichment/batch` streams progress via SSE while iterating:
**CrossRef → OpenAlex → Unpaywall → Semantic Scholar → PDF extraction →
WebDB-native** (each pub tries sources in order until success). Best fields
merged across sources. 300 ms pacing between pubs. Truncates abstracts at
5000 chars.

### Analysis pipeline

`POST /api/analysis/batch` streams progress via SSE. Configurable `batchSize`
(1–5 pubs per LLM call), `minWordCount`, `forceReanalyze`, `enrichedOnly`.
Reads model from `x-llm-model` header (set by `AnalysisModal`) → falls back
to `LLM_DEFAULT_MODEL` env → hardcoded `anthropic/claude-sonnet-4`. Computes
`press_score` server-side via the documented weighted formula (see
`lib/scoring.ts:computePressScore` for the JS mirror). 1-second pacing between
batches. Writes back per-row scoring + Pitch + Angle + Reasoning + Haiku.

### Session-pipeline (interactive scoring)

`scripts/session-pipeline.mjs` — runs scoring batches inside a Claude Code
session (no API cost; `llm_model = anthropic/claude-opus-4-7-session`).
Imports `lib/score-weights.json` directly via `with { type: 'json' }`, so the
formula stays in lockstep with the UI/test code.

---

## 9. Researchers feature (Forscher:innen-Ranking)

Added late April 2026. Detail design + rationale: see `RESEARCHERS_PLAN.md` at
the repo root.

### Architecture

**Postgres-first**: aggregation, ranking, trend deltas, sparklines, top-pub,
score bands, co-author counts and Bayesian shrinkage all live in three pure-SQL
`LANGUAGE sql STABLE` functions, called via `supabase.rpc()`. The Next routes
are 30-line wrappers that validate query params and forward.

```
top_researchers(p_since, p_metric, p_authorship_scope, p_oestat3_ids,
                p_include_external, p_include_deceased, p_member_only,
                p_min_value, p_limit, p_exclude_ita, p_exclude_outreach)
  → rank_now, delta_count_high, is_newcomer, person fields,
    member_type_de, count_high, sum_score, avg_score, weighted_avg,
    pubs_total, self_highlight_count, top_pub jsonb (incl. citation),
    sparkline jsonb (12 monthly buckets)

researcher_distribution(<same filter set>, p_limit=500)
  → person_id, lastname, firstname, oestat3_name_de,
    metric_value, pubs_total, count_high, is_member

researcher_detail(p_person_id, p_since, p_exclude_ita, p_exclude_outreach)
  → person jsonb, stats jsonb, activity jsonb (24 monthly bands),
    coauthors jsonb (top 10), publications jsonb (incl. citation)
```

Migrations `20260428000002` through `20260428000009` build these incrementally —
indices first, then each function with its own evolution (ITA filter,
outreach filter, weighted_avg, citation field).

### Performance

All three functions clock <50 ms on the local dataset (~37k pubs, 48k junction
rows). Hot path covered by partial composite index `idx_pub_analyzed_window`
on `(published_at, press_score) WHERE analysis_status = 'analyzed' AND
press_score IS NOT NULL`.

### UI

```
app/researchers/
├── page.tsx                       # Spotlight + Tabs[Rangliste|Verteilung]
├── _components/
│   ├── spotlight-podium.tsx       # Top 3 hero, Newsreader serif, motion-number
│   ├── leaderboard-table.tsx      # custom + motion.layout for FLIP reorder
│   ├── beeswarm-view.tsx          # SVG + d3-force collision
│   ├── filters-bar.tsx            # nuqs-bound, with InfoBubbles
│   ├── person-avatar.tsx          # HSL-hash initials fallback
│   ├── sparkline.tsx              # 60×16 SVG with stroke-draw animation
│   └── trend-delta.tsx            # ▲ 3 / ▼ 2 / NEU
├── _hooks/use-leaderboard.ts      # race-condition-safe fetcher
└── _filters.ts                    # nuqs parsers + PRESET_FIELDS

app/persons/[id]/
├── page.tsx                       # detail page
└── _components/
    ├── person-header.tsx          # Avatar XL + 4 StatCards
    ├── activity-chart.tsx         # Recharts BarChart, score-band colors
    ├── coauthor-block.tsx         # avatar list with shared-pub counts
    └── pub-list.tsx               # compact list with score chips

lib/researchers.ts                 # shared TS types matching PG returns
```

### Metrics

- `count_high`: pubs with `press_score ≥ 0.7`
- `sum_score`: simple sum
- `weighted_avg`: Bayesian-shrunk avg, IMDb formula `(n·avg + 3·prior) / (n+3)`,
  prior from current filter scope
- `avg_score`: raw mean (informational, low-N flag in tooltip)
- `pubs_total`: count of analyzed pubs

Default sort is `count_high` — most reliable signal of "press-worthy producer."

---

## 10. InfoBubble system

`components/info-bubble.tsx` + `lib/explanations.tsx`. ~40 structured
explanations (title / formula / body / example / note) keyed by id, referenced
via `<InfoBubble id="…" />`.

Trigger is a hybrid Popover: hover (with 120/150 ms delays) on pointer-fine
devices, tap on touch, click-to-pin on either, focus on keyboard.
`(hover: hover) and (pointer: fine)` media query for capability detection.
Built per the research recommendation that shadcn/ui has no canonical hybrid
recipe — Radix HoverCard alone breaks on touch.

Globally toggleable: nav button writes to `localStorage` + custom event for
cross-tab and same-tab sync. When off, `<InfoBubble>` returns `null`.

Wired across: dashboard StatCards, top-10 panel, score distribution,
dimensions radar, top keywords; researchers page (filters, spotlight,
leaderboard headers, beeswarm); person detail (StatCards, activity chart,
coauthors, pub list); publication detail (StoryScore, 5 ScoreBars, AI
provenance, haiku eyebrow); publications table (score column header).

---

## 11. Hybrid filter pattern

`app/publications/page.tsx` + `_filters.ts`. Linear/Notion convention: presets
are *views* that reset preset-territory fields on switch; modifier fields
(search, oestat, units, dates, etc.) survive every preset switch as user-set
overlays.

Defined by the `PRESET_FIELDS` constant in `_filters.ts` — currently
`['peer', 'popsci', 'hasSumDe', 'minScore', 'showAll', 'maHl', 'types']`.
Anything outside is a modifier.

`presetModified` derived state shows a "Preset modifiziert · zurücksetzen"-pill
when the user has hand-tweaked a preset-territory field. Empty-state has
one-click "Preset-Modifikationen zurücknehmen" + "Alle Filter zurücksetzen"
actions.

---

## 12. Title-truncation heuristic

`displayTitle(primary, citation)` in `lib/html-utils.ts`. The WebDB import
truncates titles at the first colon — full subtitle lives in `citation`.
Heuristic extracts subtitle when the citation segment starts with exactly
`<dbTitle>:`. Conservative match avoids gluing author names; sanity cap at
260 chars guards against citation-parser noise. See memory
`webdb_title_truncation.md`.

Applied at: dashboard top-10, publications table, publication detail H1,
spotlight pull-quote, person-detail PubList. Tested in
`lib/html-utils.test.ts` for null-citation, prefix-match-extension, and
no-match-unchanged cases.

---

## 13. Configuration & deployment

### Required environment variables

```
# Server-side credentials (NEVER committed, NEVER exposed to browser)
SUPABASE_URL=                    # full https URL of the Supabase project
SUPABASE_ANON_KEY=               # public anon key (RLS-protected reads)
SUPABASE_SERVICE_ROLE_KEY=       # service-role key (mutations bypass RLS)
OPENROUTER_API_KEY=              # default OpenRouter key (user can override per-request)
LLM_DEFAULT_MODEL=               # optional: default model id (else 'anthropic/claude-sonnet-4')

# Auth gate
GATE_PASSWORD=                   # plaintext password (server-only)
GATE_TOKEN=                      # sha256(GATE_PASSWORD), pre-computed for fast middleware compare

# Browser-readable (legacy path; kept for the CSV-upload-zone direct Supabase call)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# MeisterTask one-way push (lib/meistertask/*) — see Section 16
MEISTERTASK_API_TOKEN=             # PAT from mindmeister.com/api, scope=meistertask
MEISTERTASK_PROJECT_ID=            # numeric, target project
MEISTERTASK_DEFAULT_SECTION_ID=    # numeric, Inbox-section where new tasks land
MEISTERTASK_HIGH_LABEL_ID=         # optional — Score-Hoch-Label (≥85%)
MEISTERTASK_MID_LABEL_ID=          # optional — Score-Mittel-Label (70–84%)
```

### Local development

```bash
# Local Supabase stack (custom ports 544xx to coexist with sibling projects;
# see memory: local_supabase_ports.md):
supabase start
# → API:    http://localhost:54421
# → DB:     postgres://...:54422
# → Studio: http://localhost:54423

npm run dev      # Next.js on http://localhost:3000
npm run typecheck
npm run lint
npm test         # vitest run-once
```

### Vercel deployment

```bash
npx vercel --prod
```

Set the env vars above in the Vercel project settings. The app uses:
- `maxDuration = 60` on SSE routes (within Vercel hobby tier streaming limit)
- Client-side CSV parsing (avoids 4.5 MB body size limit on serverless)
- No Docker, no persistent server processes

### Self-hosted

```bash
npm run build && npm start    # port 3000
```

---

## 14. Migration rollback strategy

See `supabase/ROLLBACK.md` for the per-migration reverse playbook. We don't
ship `*_down.sql` files — the rollback approach is documented per-migration
in the cookbook so the recovery path is explicit when something goes wrong
in production.

Short version:
- Most additive migrations (CREATE INDEX, CREATE FUNCTION) → drop equivalents.
- Schema changes (ALTER TABLE … ADD COLUMN, junction-table inserts) → require
  per-case data preservation.
- The `publication_oestat6_matview` is the one MV; refresh policy still TBD
  (see Section 3).

---

## 15. Porting notes (historical)

This application was originally ported from the main OeAW Dashboard's
Python/FastAPI backend. Most of the "porting decisions" are no longer
load-bearing (the relational schema replaces the flat-table assumption from
the port era), but for archeologists:

| Aspect | Python original | Current TypeScript |
|---|---|---|
| CSV parsing | `csv.DictReader` w/ encoding fallbacks | PapaParse (`header: true`) |
| HTML stripping | `re.sub(r'<[^>]+>', '', text)` | Same regex via `String.replace()` |
| Date parsing | `datetime.fromtimestamp(int(pub_date))` | `new Date(ts * 1000).toISOString()` |
| LLM API | `aiohttp.post()` | `fetch()` to OpenRouter |
| Score calculation | `sum(scores[dim] * weights[dim])` | `lib/scoring.ts:computePressScore` |
| DB access | `postgrest-py` direct | `@supabase/supabase-js` via `supabase.rpc(...)` |
| Background tasks | `asyncio.create_task()` | SSE streaming (real-time progress) |
| Embeddings (FAISS) | Used | **Not ported** — could be added (pgvector) for semantic search |
| Topic extraction | BERTopic | Not ported |

**Intentionally omitted** from this standalone tool:
- Vector embeddings + FAISS similarity search (pgvector is the migration path
  if/when semantic search becomes a priority)
- BERTopic topic extraction
- Article ingestion (RSS, NewsAPI, Bluesky)
- Topic-to-publication matching
- Redis caching layer

---

## 16. MeisterTask integration

One-way push of high-scoring publications to a MeisterTask project as Tasks
for the press team. Shipped 2026-04-29 (commits MT1–MT3, MT1b). Replaces
the original "build our own kanban UI" plan from `editorial_pipeline_proposal.md`
— external tool the press team already uses, far less build effort.

### Files

| Layer | Path |
|---|---|
| Schema | `supabase/migrations/20260429000005_meistertask_task_id.sql` |
| Schema | `supabase/migrations/20260429000006_meistertask_task_token.sql` |
| Lib | `lib/meistertask/{client,mapping,constants}.ts` |
| Tests | `lib/meistertask/mapping.test.ts` (10 tests) |
| Route | `app/api/meistertask/push/route.ts` |
| UI button | `app/publications/[id]/_components/meistertask-button.tsx` |
| UI indicator | `components/publication-table.tsx` (inline ExternalLink-Icon) |

### Idempotency + race safety

Two-stage:
1. On `POST /api/meistertask/push`, early-return if `pub.meistertask_task_id`
   is already set (no upstream call).
2. After successful upstream `POST /sections/{id}/tasks`, the local DB UPDATE
   is conditional: `WHERE meistertask_task_id IS NULL`. Concurrent pushes
   can only commit once. The loser writes an orphan task in MeisterTask,
   recoverable via the `<!-- pub-id: <uuid> -->` HTML-marker the mapping
   appends to every notes-footer (markdown renders it invisible;
   `GET /tasks/{id}` reads it back for reconciliation scripts later).

### URL forms

| Use | Form |
|---|---|
| API canonical | numeric `task.id` (e.g. `224409300`) — for `GET /tasks/{id}` |
| Web UI deep-link | token (e.g. `u9Qg4K51`) — `/app/task/<token>` |

The numeric form `/app/task/<id>` 404s in the web UI ("Zugriff nicht möglich"),
empirically verified during MT3 smoke-test. Both stored side by side; the
button + indicator URLs are built from the token.

### Threshold + scoring band

`PRESS_SCORE_PUSH_THRESHOLD = 0.7` in `lib/meistertask/constants.ts` — read
by both the backend route guard and the frontend button's disabled state.
Single source of truth.

`SCORE_HIGH_THRESHOLD = 0.85` decides label assignment when
`MEISTERTASK_HIGH_LABEL_ID` + `MEISTERTASK_MID_LABEL_ID` are both set.
Below 0.85: mid-label. Above-or-equal: high-label. Below-0.7 never gets
pushed, so a "low" band would be dead — only two labels exist.

### Status

MVP shipped (single-pub push, single-button UI, no bulk, no two-way
sync, no setup wizard). Memory `meistertask_integration.md` has
the full design backstory + pending V2 ideas (bulk push, polling
worker for "task moved to done → mark coverage").
