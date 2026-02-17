# OeAW Press Relevance Analyzer — Implementation Documentation

**Version**: 1.0.0
**Created**: 2026-02-13
**Stack**: Next.js 16.1.6 / React 19 / Supabase / OpenRouter / Tailwind CSS 4

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Directory Structure](#2-directory-structure)
3. [Database Schema](#3-database-schema)
4. [Library Layer (`lib/`)](#4-library-layer)
   - 4.1 [Type System (`types.ts`)](#41-type-system)
   - 4.2 [Supabase Client (`supabase.ts`)](#42-supabase-client)
   - 4.3 [Constants (`constants.ts`)](#43-constants)
   - 4.4 [CSV Parser (`csv-parser.ts`)](#44-csv-parser)
   - 4.5 [Settings Store (`settings-store.ts`)](#45-settings-store)
   - 4.6 [API Helpers (`api-helpers.ts`)](#46-api-helpers)
   - 4.7 [Enrichment Clients](#47-enrichment-clients)
   - 4.8 [Analysis / LLM Integration](#48-analysis--llm-integration)
5. [API Routes](#5-api-routes)
   - 5.1 [Publications Import](#51-publications-import)
   - 5.2 [Publications List & Stats](#52-publications-list--stats)
   - 5.3 [Publications Single](#53-publications-single)
   - 5.4 [Enrichment Batch (SSE)](#54-enrichment-batch-sse)
   - 5.5 [Analysis Batch (SSE)](#55-analysis-batch-sse)
   - 5.6 [Export CSV / JSON](#56-export-csv--json)
6. [UI Components](#6-ui-components)
   - 6.1 [Navigation](#61-navigation)
   - 6.2 [Score Visualization](#62-score-visualization)
   - 6.3 [Publication Table](#63-publication-table)
   - 6.4 [CSV Upload Zone](#64-csv-upload-zone)
   - 6.5 [SSE Progress Card](#65-sse-progress-card)
7. [Pages](#7-pages)
   - 7.1 [Dashboard (`/`)](#71-dashboard)
   - 7.2 [Upload (`/upload`)](#72-upload)
   - 7.3 [Publications (`/publications`)](#73-publications)
   - 7.4 [Analysis (`/analysis`)](#74-analysis)
   - 7.5 [Settings (`/settings`)](#75-settings)
8. [Data Flow](#8-data-flow)
   - 8.1 [CSV Import Pipeline](#81-csv-import-pipeline)
   - 8.2 [Enrichment Pipeline](#82-enrichment-pipeline)
   - 8.3 [Analysis Pipeline](#83-analysis-pipeline)
9. [Configuration & Credentials](#9-configuration--credentials)
10. [Deployment](#10-deployment)
11. [Porting Notes](#11-porting-notes)

---

## 1. Architecture Overview

The application is a **single Next.js project** that combines frontend UI and backend API routes, designed for Vercel deployment with Supabase as the managed database.

```
┌──────────────────────────────────────────────────────────┐
│                      Browser (Client)                     │
│                                                          │
│  ┌─────────┐  ┌───────────┐  ┌──────────┐  ┌─────────┐ │
│  │Dashboard │  │  Upload   │  │  Pubs    │  │Analysis │ │
│  │  page    │  │   page    │  │  page    │  │  page   │ │
│  └────┬─────┘  └────┬──────┘  └────┬─────┘  └────┬────┘ │
│       │              │              │              │      │
│       │   PapaParse  │              │              │      │
│       │   (client-   │              │              │      │
│       │    side CSV)  │              │              │      │
│       └──────┬───────┘──────┬───────┘──────┬───────┘      │
│              │              │              │              │
│         fetch() + SSE EventSource (headers from localStorage)
└──────────────┼──────────────┼──────────────┼──────────────┘
               │              │              │
┌──────────────┼──────────────┼──────────────┼──────────────┐
│              │    Next.js API Routes (Serverless)          │
│              │              │              │              │
│  ┌───────────▼──┐  ┌───────▼──────┐  ┌───▼──────────┐   │
│  │ /api/pubs/   │  │ /api/enrich/ │  │ /api/analysis│   │
│  │   import     │  │   batch      │  │   /batch     │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         │                 │                  │           │
│         │     ┌───────────┤                  │           │
│         │     │           │                  │           │
│   ┌─────▼─────▼───┐  ┌───▼───────┐  ┌──────▼────────┐  │
│   │   Supabase    │  │ CrossRef  │  │  OpenRouter   │  │
│   │   (Postgres)  │  │ Unpaywall │  │  (LLM API)   │  │
│   │               │  │ Sem.Schol.│  │              │  │
│   └───────────────┘  └───────────┘  └──────────────┘  │
└──────────────────────────────────────────────────────────┘
```

**Key design decisions**:

- **Client-side CSV parsing**: PapaParse runs in the browser to avoid Vercel's 4.5 MB serverless body size limit. The parsed JSON is then sent to the API in 100-row chunks.
- **SSE for long operations**: Enrichment and analysis use Server-Sent Events streaming to keep connections alive within Vercel's 60-second streaming timeout (set via `maxDuration = 60`).
- **Credentials via headers**: The user's API keys are stored in `localStorage` and sent as custom HTTP headers (`x-supabase-url`, `x-supabase-key`, `x-openrouter-key`, `x-llm-model`) on every API request. This avoids storing secrets server-side while keeping the app stateless.
- **Single flat table**: All data lives in one `publications` table — no joins, no foreign keys. Fields progress through statuses: `pending` → `enriched`/`failed` → `analyzed`/`failed`.

---

## 2. Directory Structure

```
oeaw-press-relevance/
├── app/
│   ├── layout.tsx                         # Root layout: Nav + Toaster
│   ├── page.tsx                           # Dashboard page
│   ├── upload/page.tsx                    # CSV upload page
│   ├── publications/page.tsx              # Browse + filter page
│   ├── analysis/page.tsx                  # Results + export page
│   ├── settings/page.tsx                  # Configuration page
│   ├── globals.css                        # Tailwind + shadcn CSS variables
│   └── api/
│       ├── publications/
│       │   ├── import/route.ts            # POST: bulk insert
│       │   ├── route.ts                   # GET: list + stats
│       │   └── [id]/route.ts             # GET + DELETE: single pub
│       ├── enrichment/
│       │   └── batch/route.ts             # POST → SSE: enrichment
│       ├── analysis/
│       │   └── batch/route.ts             # POST → SSE: LLM analysis
│       └── export/
│           ├── csv/route.ts               # GET: CSV download
│           └── json/route.ts              # GET: JSON download
├── components/
│   ├── nav.tsx                            # Top navigation bar
│   ├── publication-table.tsx              # Expandable data table
│   ├── score-bar.tsx                      # Score bars + badges
│   ├── csv-upload-zone.tsx                # Drag-and-drop uploader
│   ├── sse-progress.tsx                   # Reusable SSE progress card
│   └── ui/                                # 13 shadcn/ui components
│       ├── button.tsx
│       ├── card.tsx
│       ├── badge.tsx
│       ├── progress.tsx
│       ├── input.tsx
│       ├── tabs.tsx
│       ├── table.tsx
│       ├── dialog.tsx
│       ├── label.tsx
│       ├── select.tsx
│       ├── separator.tsx
│       ├── sonner.tsx
│       └── textarea.tsx
├── lib/
│   ├── types.ts                           # All TypeScript interfaces
│   ├── supabase.ts                        # Supabase client factory
│   ├── constants.ts                       # Mappings, weights, models
│   ├── csv-parser.ts                      # PapaParse + field mapping
│   ├── settings-store.ts                  # localStorage persistence
│   ├── api-helpers.ts                     # Server-side utilities
│   ├── utils.ts                           # cn() classname merge (shadcn)
│   ├── enrichment/
│   │   ├── crossref.ts                    # CrossRef API client
│   │   ├── unpaywall.ts                   # Unpaywall API client
│   │   └── semantic-scholar.ts            # Semantic Scholar API client
│   └── analysis/
│       ├── openrouter.ts                  # OpenRouter API + scoring
│       └── prompts.ts                     # LLM system + evaluation prompts
├── supabase-schema.sql                    # Database DDL
├── .env.local                             # Environment variable template
├── package.json                           # Dependencies
├── next.config.ts                         # Next.js configuration
├── tailwind.config.ts                     # Tailwind configuration
├── tsconfig.json                          # TypeScript configuration
├── components.json                        # shadcn/ui configuration
└── README.md                              # Setup guide
```

**File count**: 30 application files (excluding `node_modules/`, `ui/` components, and config)
**Lines of code**: ~2,700 (application code only)

---

## 3. Database Schema

**File**: `supabase-schema.sql`

A single `publications` table with 33 columns organized into four sections:

### Core Fields (from CSV import)

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | UUID | `gen_random_uuid()` | Primary key |
| `title` | TEXT NOT NULL | — | Publication title (max 500 chars from CSV) |
| `authors` | TEXT | NULL | Lead author(s) |
| `abstract` | TEXT | NULL | English or German summary |
| `doi` | TEXT | NULL | Digital Object Identifier |
| `published_at` | DATE | NULL | Publication date |
| `publication_type` | TEXT | NULL | Mapped from type code (26 types) |
| `institute` | TEXT | NULL | Organizational unit at OeAW |
| `open_access` | BOOLEAN | FALSE | Open access flag |
| `oa_type` | TEXT | NULL | OA variant (oa_gold, oa_postprint, etc.) |
| `url` | TEXT | NULL | Website or download link |
| `citation` | TEXT | NULL | Citation string (HTML stripped) |
| `csv_uid` | TEXT | NULL | Original UID from HeboWebDB export |

### Enrichment Fields (from APIs)

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `enrichment_status` | TEXT | 'pending' | pending / enriched / failed |
| `enriched_abstract` | TEXT | NULL | Abstract from CrossRef or Semantic Scholar |
| `enriched_keywords` | TEXT[] | NULL | Subject keywords array |
| `enriched_journal` | TEXT | NULL | Journal or venue name |
| `enriched_source` | TEXT | NULL | Which API succeeded (crossref, unpaywall, semantic_scholar) |
| `full_text_snippet` | TEXT | NULL | Extended content or PDF URL |
| `word_count` | INTEGER | 0 | Word count of enriched content |

### Analysis Fields (from LLM)

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `analysis_status` | TEXT | 'pending' | pending / analyzed / failed |
| `press_score` | FLOAT | NULL | Weighted composite score (0.0–1.0) |
| `public_accessibility` | FLOAT | NULL | Dimension score (0.0–1.0) |
| `societal_relevance` | FLOAT | NULL | Dimension score (0.0–1.0) |
| `novelty_factor` | FLOAT | NULL | Dimension score (0.0–1.0) |
| `storytelling_potential` | FLOAT | NULL | Dimension score (0.0–1.0) |
| `media_timeliness` | FLOAT | NULL | Dimension score (0.0–1.0) |
| `pitch_suggestion` | TEXT | NULL | 4–6 sentence German press pitch |
| `target_audience` | TEXT | NULL | Suggested media outlets |
| `suggested_angle` | TEXT | NULL | One-sentence German narrative angle |
| `reasoning` | TEXT | NULL | 2–3 sentence scoring rationale |
| `llm_model` | TEXT | NULL | Model used (e.g., anthropic/claude-sonnet-4) |
| `analysis_cost` | FLOAT | NULL | Estimated API cost in USD |

### Metadata

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `import_batch` | TEXT | NULL | Batch identifier for grouping imports |
| `created_at` | TIMESTAMPTZ | `NOW()` | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | `NOW()` | Last modification timestamp |

### Indexes

| Index | Column(s) | Type | Purpose |
|-------|-----------|------|---------|
| `idx_pub_doi` | doi | btree | DOI lookups for dedup and enrichment |
| `idx_pub_analysis` | analysis_status | btree | Filter pending/analyzed/failed |
| `idx_pub_enrichment` | enrichment_status | btree | Filter enrichment queue |
| `idx_pub_score` | press_score DESC | btree | Top-N score queries |
| `idx_pub_date` | published_at DESC | btree | Chronological sorting |
| `idx_pub_title` | title | GIN (pg_trgm) | Case-insensitive title search |

### Row Level Security

RLS is enabled with a permissive policy (`USING (true) WITH CHECK (true)`) since this is a single-user tool using the anon key.

---

## 4. Library Layer

### 4.1 Type System

**File**: `lib/types.ts` (118 lines)

Defines all TypeScript interfaces used across the application:

| Interface | Purpose |
|-----------|---------|
| `Publication` | Full database row with all 33 fields |
| `PublicationInsert` | Subset for CSV import (enrichment/analysis fields omitted) |
| `EnrichmentResult` | Return type from enrichment API clients |
| `AnalysisResult` | Single publication evaluation from LLM (5 scores + text fields) |
| `LLMResponse` | Top-level LLM response wrapper (`{ evaluations: AnalysisResult[] }`) |
| `PublicationStats` | Dashboard aggregate stats |
| `SSEEvent` | Server-Sent Event payload |
| `AppSettings` | User configuration (API keys, model, parameters) |

`DEFAULT_SETTINGS` constant provides fallback values:
- LLM model: `anthropic/claude-sonnet-4`
- Min word count: `100`
- Batch size: `3`
- Supabase credentials: from `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars

### 4.2 Supabase Client

**File**: `lib/supabase.ts` (28 lines)

Two factory functions:

- **`getSupabaseClient(url?, anonKey?)`** — Returns a cached Supabase client. Re-creates the client only if credentials change. Used on the client side (browser). Falls back to env vars if no arguments provided.

- **`createServerClient(url, anonKey)`** — Creates a fresh (non-cached) client for API route handlers. Always receives credentials from request headers.

### 4.3 Constants

**File**: `lib/constants.ts` (78 lines)

Central repository for all mapping tables and configuration values:

**Publication Type Map** (26 entries): Maps CSV type codes (`"0"` through `"26"`) to human-readable names. Example: `"1"` → `"Journal Article"`, `"6"` → `"Conference Paper"`.

**Open Access Values**:
- True set: `oa_gold`, `oa_postprint`, `oa_preprint`, `Open`, `1`, `oacc`
- False set: `nicht_oacc`, `Restricted`, `Unknown`, `""`, `0`

**Score Weights** (must sum to 1.0):

| Dimension | Weight | Color |
|-----------|--------|-------|
| `public_accessibility` | 0.20 | #3b82f6 (blue) |
| `societal_relevance` | 0.25 | #10b981 (green) |
| `novelty_factor` | 0.20 | #f59e0b (amber) |
| `storytelling_potential` | 0.20 | #8b5cf6 (purple) |
| `media_timeliness` | 0.15 | #ef4444 (red) |

**LLM Models** (6 options):

| Model ID | Label | Cost per 1M tokens |
|----------|-------|---------------------|
| `anthropic/claude-sonnet-4` | Claude Sonnet 4 | $9.00 |
| `anthropic/claude-3.5-sonnet` | Claude 3.5 Sonnet | $9.00 |
| `deepseek/deepseek-chat` | DeepSeek Chat | $0.50 |
| `meta-llama/llama-3.2-3b-instruct:free` | Llama 3.2 3B (Free) | $0.00 |
| `google/gemini-2.0-flash-001` | Gemini 2.0 Flash | $0.15 |
| `openai/gpt-4o-mini` | GPT-4o Mini | $0.60 |

### 4.4 CSV Parser

**File**: `lib/csv-parser.ts` (177 lines)

Handles client-side parsing of HeboWebDB CSV exports:

**`parseCsvFile(file: File): Promise<ParseResult>`**

1. Reads the file using PapaParse with `header: true`, `skipEmptyLines: true`, UTF-8 encoding
2. Strips BOM from header names
3. For each row:
   - Skips rows without a title
   - Truncates title to 500 characters
   - Maps `type` code via `PUBLICATION_TYPE_MAP` (defaults to "Other")
   - Parses `open_access` against `OA_TRUE_VALUES` (rejects strings > 30 chars)
   - Converts `pub_date` from Unix timestamp (seconds) to ISO date string, validates year 1900–2100
   - Prefers English summary over German; prefers English citation over German
   - Strips HTML from citations
   - Prefers `website_link` over `download_link` for URL
   - Removes NUL bytes (`\x00`) from all text fields

**`deduplicatePublications(newPubs, existingTitles, existingDois, existingUids)`**

Three-layer deduplication:
1. **Title** (case-insensitive) — against DB + within batch
2. **DOI** (case-insensitive) — against DB + within batch
3. **UID** (exact match) — against DB only

Returns `{ unique: PublicationInsert[], duplicateCount: number }`.

### 4.5 Settings Store

**File**: `lib/settings-store.ts` (36 lines)

Browser-side persistence using `localStorage` with key `oeaw-press-relevance-settings`.

- **`loadSettings()`** — Merges stored JSON with `DEFAULT_SETTINGS`. Returns defaults on server side or parse error.
- **`saveSettings(settings)`** — Serializes to `localStorage`.
- **`getApiHeaders()`** — Builds HTTP headers from current settings:
  - `Content-Type: application/json`
  - `x-supabase-url: <url>` (if configured)
  - `x-supabase-key: <anonKey>` (if configured)
  - `x-openrouter-key: <apiKey>` (if configured)
  - `x-llm-model: <model>` (if configured)

### 4.6 API Helpers

**File**: `lib/api-helpers.ts` (49 lines)

Server-side utilities for API route handlers:

- **`getSupabaseFromRequest(req)`** — Extracts Supabase credentials from `x-supabase-url` and `x-supabase-key` headers, falls back to env vars, throws if missing.
- **`getOpenRouterKey(req)`** — Extracts from `x-openrouter-key` header or `OPENROUTER_API_KEY` env var.
- **`getLLMModel(req)`** — Extracts from `x-llm-model` header, defaults to `anthropic/claude-sonnet-4`.
- **`createSSEStream()`** — Creates an SSE streaming helper:
  - Returns `{ stream: ReadableStream, send(event, data), close() }`
  - `send()` formats as standard SSE: `event: {name}\ndata: {JSON}\n\n`
  - Used by enrichment and analysis batch routes

### 4.7 Enrichment Clients

Three API clients implementing the same pattern: clean DOI → fetch → parse → return `EnrichmentResult | null`.

#### CrossRef (`lib/enrichment/crossref.ts`, 40 lines)

- **Endpoint**: `https://api.crossref.org/works/{DOI}`
- **User-Agent**: `OeAW-Press-Relevance/1.0 (mailto:admin@oeaw.ac.at)`
- **Timeout**: 10 seconds
- **Extracts**: abstract (HTML-stripped), keywords (from `subject`, max 20), journal (from `container-title[0]`)
- **Returns**: `{ abstract, keywords, journal, source: 'crossref', full_text_snippet, word_count }`

#### Unpaywall (`lib/enrichment/unpaywall.ts`, 29 lines)

- **Endpoint**: `https://api.unpaywall.org/v2/{DOI}?email=admin@oeaw.ac.at`
- **Timeout**: 10 seconds
- **Checks**: `is_oa` flag — returns null if not open access
- **Extracts**: journal name, best OA location PDF URL
- **Returns**: `{ journal, source: 'unpaywall', full_text_snippet: "Open access PDF available: {url}", word_count: 0 }`

#### Semantic Scholar (`lib/enrichment/semantic-scholar.ts`, 39 lines)

- **Endpoint**: `https://api.semanticscholar.org/graph/v1/paper/DOI:{DOI}?fields=title,abstract,authors,year,openAccessPdf,citationCount,venue,tldr`
- **User-Agent**: `OeAW-Press-Relevance/1.0`
- **Timeout**: 10 seconds
- **Extracts**: abstract (falls back to TLDR AI summary), venue as journal, OA PDF URL
- **Returns**: `{ abstract, journal, source: 'semantic_scholar', full_text_snippet, word_count }`

### 4.8 Analysis / LLM Integration

#### Prompts (`lib/analysis/prompts.ts`, 58 lines)

**System prompt**: Establishes a persona as a senior science communication expert at OeAW who regularly pitches to Austrian media (ORF, Der Standard, Die Presse, APA, Wiener Zeitung). Instructs the model to respond with valid JSON only.

**`buildEvaluationPrompt(publications)`**: Constructs the user message:
- For each publication: title, authors (first 3), institute, published date, keywords (first 8), content (first 500 words)
- Content priority: `enriched_abstract` > `abstract` > `citation`
- Requests 9 fields per publication: 5 numeric scores (0.0–1.0), `pitch_suggestion` (German, 4–6 sentences), `target_audience`, `suggested_angle` (German, 1 sentence), `reasoning` (2–3 sentences)
- Specifies exact JSON response format with `publication_index` for mapping

#### OpenRouter Client (`lib/analysis/openrouter.ts`, 83 lines)

**`analyzePublications(publications, apiKey, model)`**:
- Sends POST to `https://openrouter.ai/api/v1/chat/completions`
- Headers: `Authorization: Bearer {key}`, `HTTP-Referer`, `X-Title`
- Parameters: `temperature: 0.4`, `max_tokens: 1500 * publications.length`, `response_format: { type: 'json_object' }`
- Timeout: 60 seconds
- Parses response JSON; falls back to extracting JSON from markdown code blocks
- Returns `{ results: AnalysisResult[], tokensUsed: number, cost: number }`

**`calculatePressScore(result)`**:
```
press_score = Σ (dimension_score × weight)
            = 0.20 × public_accessibility
            + 0.25 × societal_relevance
            + 0.20 × novelty_factor
            + 0.20 × storytelling_potential
            + 0.15 × media_timeliness
```
Rounded to 4 decimal places.

**`estimateCost(tokenCount, model)`**: Looks up cost per million tokens from `COST_PER_MILLION_TOKENS` (defaults to $5.00 for unknown models). Returns `(tokenCount / 1,000,000) × rate`.

---

## 5. API Routes

All routes extract Supabase credentials from request headers via `getSupabaseFromRequest()`. Error responses follow the pattern `{ error: string }` with appropriate HTTP status codes.

### 5.1 Publications Import

**`POST /api/publications/import`** — `app/api/publications/import/route.ts` (49 lines)

Receives client-parsed publications and inserts them into Supabase.

**Request**:
```json
{
  "publications": [ PublicationInsert, ... ],
  "batch": "import_2026-02-13"          // optional, defaults to date-based
}
```

**Processing**: Splits into chunks of 100, inserts via `supabase.from('publications').insert(chunk).select('id')`. Adds `import_batch` field to each row. Continues on chunk failures and accumulates counts.

**Response**:
```json
{ "inserted": 2450, "errors": 3, "total": 2453 }
```

### 5.2 Publications List & Stats

**`GET /api/publications`** — `app/api/publications/route.ts` (96 lines)

Two modes controlled by the `stats` query parameter.

**Stats mode** (`?stats=true`):
```json
{
  "total": 2500,
  "enriched": 1200,
  "analyzed": 800,
  "avg_score": 0.5432,
  "high_score_count": 120     // press_score >= 0.6
}
```
Executes 4 separate count queries plus a score aggregation query.

**List mode** (default):
| Param | Default | Description |
|-------|---------|-------------|
| `page` | 1 | Page number |
| `pageSize` | 20 | Results per page |
| `search` | — | Case-insensitive title search (ilike) |
| `enrichment_status` | — | Filter: pending / enriched / failed |
| `analysis_status` | — | Filter: pending / analyzed / failed |
| `publication_type` | — | Exact match |
| `sort` | created_at | Sort column |
| `order` | desc | asc or desc |

```json
{
  "publications": [ Publication, ... ],
  "total": 2500,
  "page": 1,
  "pageSize": 20
}
```

### 5.3 Publications Single

**`GET /api/publications/[id]`** — Returns full Publication object or 404.

**`DELETE /api/publications/[id]`** — Deletes publication, returns `{ "success": true }`.

### 5.4 Enrichment Batch (SSE)

**`POST /api/enrichment/batch`** — `app/api/enrichment/batch/route.ts` (145 lines)

**Max duration**: 60 seconds (Vercel streaming)

**Request**: `{ "limit": 20 }` (max 50)

**Behavior**:
1. Queries up to `limit` publications where `enrichment_status = 'pending'` and `doi IS NOT NULL`, ordered by `created_at DESC`
2. Returns simple JSON `{ "message": "No publications to enrich" }` if none found
3. Otherwise returns SSE stream and processes in background:

**For each publication**:
1. Try CrossRef → extract abstract, keywords, journal
2. If no abstract yet: try Unpaywall → get OA PDF link, journal
3. If still no abstract: try Semantic Scholar → abstract or TLDR, venue, PDF
4. Merge best fields from all sources that responded
5. Update DB row with enrichment data or mark as failed
6. Wait 300ms (rate limiting)

**SSE events**:
- `progress`: `{ processed, total, current_title }`
- `complete`: `{ processed, total, successful, failed }`

### 5.5 Analysis Batch (SSE)

**`POST /api/analysis/batch`** — `app/api/analysis/batch/route.ts` (144 lines)

**Max duration**: 60 seconds (Vercel streaming)

**Request**:
```json
{
  "limit": 20,              // max 100
  "batchSize": 3,           // publications per LLM call, max 5
  "minWordCount": 100,      // filter by enriched word count
  "forceReanalyze": false   // re-analyze already-scored publications
}
```

**Behavior**:
1. Queries publications: if `forceReanalyze` is false, only `analysis_status = 'pending'`; optionally filtered by `word_count >= minWordCount`
2. Processes in batches of `batchSize`:
   - Calls `analyzePublications()` with the batch
   - Calculates `press_score` via weighted average
   - Updates each DB row with all score dimensions + text fields
   - On LLM error: marks batch as failed, sends error event
3. 1-second delay between batches

**SSE events**:
- `progress`: `{ processed, total, current_title, tokens_used, cost }`
- `error`: `{ message, batch_start }`
- `complete`: `{ processed, total, successful, failed, tokens_used, cost }`

### 5.6 Export CSV / JSON

**`GET /api/export/csv`** — Downloads analyzed publications as CSV with 19 columns. Content-Disposition attachment with date-stamped filename. Proper CSV escaping (quotes, commas, newlines).

**`GET /api/export/json`** — Downloads as pretty-printed JSON (2-space indent). Same filtering and sorting.

Both accept `?analyzed=false` to include all publications.

---

## 6. UI Components

### 6.1 Navigation

**File**: `components/nav.tsx` (46 lines)

Fixed top navigation bar with 5 links. Highlights the active route using `usePathname()`. Links: Dashboard (BarChart3), Upload (Upload), Publications (BookOpen), Analysis (Sparkles), Settings (Settings). Icons from Lucide React.

### 6.2 Score Visualization

**File**: `components/score-bar.tsx` (65 lines)

**`ScoreBar`**: Renders a single dimension score as a colored progress bar.
- Normal mode: label + percentage + full-width bar
- Compact mode: 64px mini-bar + percentage text
- Color and label looked up from `SCORE_COLORS` and `SCORE_LABELS`

**`PressScoreBadge`**: Renders the composite press score as a colored pill:
- >= 70%: green background
- >= 50%: yellow background
- >= 30%: orange background
- < 30%: neutral background
- null: "N/A" text

### 6.3 Publication Table

**File**: `components/publication-table.tsx` (223 lines)

Expandable data table with 5–7 columns.

**Columns**: expand toggle, title (+ institute subtitle), authors, publication type badge, year, enrichment status (optional), press score badge (optional).

**Expanded detail view** (two-column grid):
- **Left**: abstract (enriched preferred), DOI link, journal, keyword badges
- **Right** (if scores shown): 5 score bars, pitch suggestion (blue box), suggested angle, target audience, reasoning, model + cost info

**StatusBadge** component: color-coded pills for pending/enriched/analyzed/failed.

### 6.4 CSV Upload Zone

**File**: `components/csv-upload-zone.tsx` (245 lines)

Complete upload workflow in one component:

1. **Drop zone**: Drag-and-drop area with file input fallback, validates `.csv` extension
2. **Parse**: Calls `parseCsvFile()` client-side, shows error on failure
3. **Preview table**: First 20 rows with columns: title, authors, type, year, DOI. Shows "+N more" if truncated.
4. **Dedup check**: Fetches existing titles/DOIs/UIDs from Supabase, runs `deduplicatePublications()`
5. **Import**: Sends unique publications to `/api/publications/import` in 100-row chunks with progress bar
6. **Result**: Shows inserted count, error count, duplicate warning

### 6.5 SSE Progress Card

**File**: `components/sse-progress.tsx` (211 lines)

Reusable component for any SSE-streaming API endpoint.

**Props**: `title`, `description`, `endpoint` (API URL), `requestBody`, `onComplete` callback

**State machine**: `idle` → `running` → `complete` | `error`

**SSE parsing**: Reads response body as stream, buffers incomplete lines, parses `event:` and `data:` lines, dispatches state updates.

**Display by state**:
- **Idle**: Description text + green "Start" button
- **Running**: Progress bar, X/Y count, percentage, current publication title, running cost/tokens
- **Complete**: Success/failed counts, total cost/tokens, "Run Again" button
- **Error**: Error message, "Retry" button

Handles both SSE streams and plain JSON responses (e.g., when there are no publications to process).

---

## 7. Pages

### 7.1 Dashboard (`/`)

**File**: `app/page.tsx` (207 lines)

- Fetches stats via `GET /api/publications?stats=true`
- Fetches top 10 via `GET /api/publications?sort=press_score&order=desc&pageSize=10&analysis_status=analyzed`
- **4 stat cards**: Total Publications, Enriched (with percentage), Analyzed (with percentage), High Potential (with average score)
- **Quick Actions**: Upload CSV, Browse Publications, View Analysis buttons
- **Top 10 list**: Ranked publications with title, authors, institute, pitch snippet, score badge
- **Empty state**: Upload prompt when no publications exist
- **Error state**: Connection error with link to Settings

### 7.2 Upload (`/upload`)

**File**: `app/upload/page.tsx` (37 lines)

- Renders `CsvUploadZone` component
- Shows expected CSV format documentation with column names
- Notes automatic deduplication behavior

### 7.3 Publications (`/publications`)

**File**: `app/publications/page.tsx` (162 lines)

- **Filter bar**: Search input (title), enrichment status dropdown, analysis status dropdown
- **Action cards**: Two `SSEProgress` cards for enrichment (20 pubs) and analysis (20 pubs)
- **Data table**: `PublicationTable` with scores and enrichment status columns
- **Pagination**: 20 per page, previous/next buttons
- Auto-refreshes table when enrichment or analysis completes

### 7.4 Analysis (`/analysis`)

**File**: `app/analysis/page.tsx` (211 lines)

- **Dimension averages**: 5 colored progress bars showing page-level averages
- **Analysis runner**: `SSEProgress` card for batch LLM analysis
- **Sort controls**: Dropdown (7 options) + ascending/descending toggle
- **Results table**: `PublicationTable` filtered to `analysis_status=analyzed`
- **Export**: CSV and JSON download buttons (fetch with headers → blob → download)
- **Pagination**: 20 per page

### 7.5 Settings (`/settings`)

**File**: `app/settings/page.tsx` (179 lines)

Three configuration sections, all persisted to `localStorage`:

1. **Supabase Connection**: URL input + anon key (password masked, toggle visibility). Green checkmark when both configured.
2. **LLM Configuration**: OpenRouter API key (masked) + model dropdown (6 options from `LLM_MODELS`).
3. **Analysis Parameters**: Min word count (0–1000), batch size (1–5, clamped).

Save and Reset buttons with toast notifications.

---

## 8. Data Flow

### 8.1 CSV Import Pipeline

```
User drops CSV file
       │
       ▼
PapaParse (client-side, in browser)
  - header: true
  - skipEmptyLines: true
  - BOM-aware header transform
       │
       ▼
Row-by-row mapping:
  - stripHtml(citation)
  - PUBLICATION_TYPE_MAP[type]
  - OA_TRUE_VALUES.has(open_access)
  - Unix timestamp → ISO date
  - summary_en || summary_de → abstract
  - website_link || download_link → url
       │
       ▼
ParseResult { publications[], errors[], totalRows, skippedRows }
       │
       ▼
User sees preview table (first 20 rows)
       │
       ▼
User clicks "Import"
       │
       ▼
Fetch existing titles/DOIs/UIDs from Supabase
       │
       ▼
deduplicatePublications() — 3-layer dedup (title, DOI, UID)
       │
       ▼
POST /api/publications/import (chunks of 100)
       │
       ▼
Supabase INSERT ... SELECT 'id'
       │
       ▼
Result: { inserted, errors, duplicateCount }
```

### 8.2 Enrichment Pipeline

```
POST /api/enrichment/batch { limit: 20 }
       │
       ▼
Query: enrichment_status='pending' AND doi IS NOT NULL
       │
       ▼
For each publication (sequential, SSE streaming):
       │
       ├──► CrossRef: GET https://api.crossref.org/works/{DOI}
       │      → abstract, keywords, journal
       │
       ├──► Unpaywall: GET https://api.unpaywall.org/v2/{DOI}?email=...
       │      → OA PDF URL, journal (only if is_oa=true)
       │
       └──► Semantic Scholar: GET https://api.semanticscholar.org/graph/v1/paper/DOI:{DOI}
              → abstract, TLDR, venue, PDF URL
       │
       ▼
Merge best results from all sources
       │
       ▼
UPDATE publications SET enrichment_status='enriched',
  enriched_abstract=..., enriched_keywords=...,
  enriched_journal=..., enriched_source=...,
  full_text_snippet=..., word_count=...
       │
       ▼
SSE: { processed, total, current_title }
       │
       ▼
300ms delay → next publication
       │
       ▼
SSE: { complete, successful, failed }
```

### 8.3 Analysis Pipeline

```
POST /api/analysis/batch { limit: 20, batchSize: 3 }
       │
       ▼
Query: analysis_status='pending' (or all if forceReanalyze)
       │
       ▼
Split into batches of batchSize
       │
       ▼
For each batch:
       │
       ├──► buildEvaluationPrompt(batch)
       │      Content: enriched_abstract > abstract > citation (500 words)
       │      Authors: first 3
       │      Keywords: first 8
       │
       ├──► POST https://openrouter.ai/api/v1/chat/completions
       │      model: user-selected
       │      temperature: 0.4
       │      max_tokens: 1500 × batch.length
       │      response_format: json_object
       │
       ├──► Parse JSON response (fallback: extract from code block)
       │
       └──► For each result:
              press_score = 0.20 × public_accessibility
                          + 0.25 × societal_relevance
                          + 0.20 × novelty_factor
                          + 0.20 × storytelling_potential
                          + 0.15 × media_timeliness
              │
              ▼
              UPDATE publications SET analysis_status='analyzed',
                press_score=..., public_accessibility=..., ...,
                pitch_suggestion=..., target_audience=...,
                suggested_angle=..., reasoning=...,
                llm_model=..., analysis_cost=...
       │
       ▼
SSE: { processed, total, current_title, tokens_used, cost }
       │
       ▼
1s delay → next batch
       │
       ▼
SSE: { complete, successful, failed, tokens_used, cost }
```

---

## 9. Configuration & Credentials

All credentials are passed per-request via HTTP headers. The flow:

1. User enters keys on the Settings page
2. Settings saved to `localStorage` (key: `oeaw-press-relevance-settings`)
3. Every API call reads settings via `getApiHeaders()` and attaches:
   - `x-supabase-url` → Supabase project URL
   - `x-supabase-key` → Supabase anon key
   - `x-openrouter-key` → OpenRouter API key
   - `x-llm-model` → Selected model identifier
4. API route handlers extract these via `getSupabaseFromRequest()`, `getOpenRouterKey()`, `getLLMModel()`
5. If headers are missing, falls back to environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `OPENROUTER_API_KEY`)

**`.env.local` template**:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
OPENROUTER_API_KEY=
```

Environment variables take effect without Settings page configuration. Both mechanisms work simultaneously (headers take precedence).

---

## 10. Deployment

### Vercel (Recommended)

```bash
npx vercel --prod
```

Set environment variables in Vercel project settings. The app uses:
- `maxDuration = 60` on SSE routes (within Vercel hobby tier streaming limit)
- Client-side CSV parsing (avoids 4.5 MB body size limit)
- No Docker, no persistent server processes

### Self-hosted

```bash
npm run build
npm start
```

Runs on port 3000. Set environment variables in `.env.local` or shell environment.

### Supabase Setup

1. Create project at supabase.com (free tier: 500 MB, 50K rows)
2. Run `supabase-schema.sql` in the SQL Editor
3. Copy URL and anon key from Settings → API

---

## 11. Porting Notes

This application was ported from the main OeAW Dashboard's Python/FastAPI backend. Key translation decisions:

| Aspect | Python Original | TypeScript Port |
|--------|----------------|-----------------|
| CSV parsing | `csv.DictReader` with encoding fallbacks | PapaParse with `header: true` |
| HTML stripping | `re.sub(r'<[^>]+>', '', text)` | Same regex via `String.replace()` |
| NUL byte handling | `.replace('\x00', '')` | `.replace(/\x00/g, '')` |
| Date parsing | `datetime.fromtimestamp(int(pub_date))` | `new Date(ts * 1000).toISOString()` |
| Type mapping | Python dict `PUBLICATION_TYPE_MAP` | TypeScript `Record<string, string>` |
| Enrichment APIs | `aiohttp` async sessions | `fetch()` with `AbortSignal.timeout()` |
| LLM API | `aiohttp.post()` to OpenRouter | `fetch()` to OpenRouter |
| Score calculation | `sum(scores[dim] * weights[dim])` | Same via `Object.entries()` loop |
| Database | Direct Supabase REST via `postgrest-py` | `@supabase/supabase-js` client |
| Embeddings | `sentence-transformers` (768-dim) | **Not ported** (not needed for press relevance) |
| Progress tracking | In-memory dict + polling endpoint | SSE streaming (real-time) |
| Configuration | Database `extraction_settings` table | `localStorage` + HTTP headers |
| Background tasks | `asyncio.create_task()` | Streaming response with async IIFE |

**Intentionally omitted** from the standalone app:
- Vector embeddings and FAISS similarity search (not used in press relevance flow)
- BERTopic topic extraction
- Article ingestion (RSS, NewsAPI, Bluesky)
- Topic-to-publication matching
- Multiple database tables and joins
- Redis caching layer
- FastAPI dependency injection
