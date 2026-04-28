# OeAW Press Relevance Analyzer

A standalone web application for analyzing Austrian Academy of Sciences (OeAW) publications for press worthiness. Upload CSV exports, enrich metadata via CrossRef/Unpaywall/Semantic Scholar, and score publications using LLM-powered press relevance analysis.

## Quick Start

### 1. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and link it: `supabase link --project-ref <your-ref>`
3. Push the schema: `supabase db push` (applies everything in `supabase/migrations/`)
4. Copy your project URL and anon key from Settings > API

For local development, `supabase start` brings up a full local stack and `supabase migration up --local` applies all migrations.

### 2. Configure Environment

Fill in your keys in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
OPENROUTER_API_KEY=sk-or-...
```

Or configure them in the Settings page after launching.

### 3. Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Deploy to Vercel

```bash
npx vercel --prod
```

Set environment variables in Vercel project settings.

## Features

- **WebDB import**: relational mirror of the OeAW TYPO3 WebDB (publications, persons, orgunits, projects, lectures, ÖSTAT taxonomies) plus legacy CSV upload with deduplication
- **Enrichment**: Fetch metadata from CrossRef, Unpaywall, Semantic Scholar, OpenAlex, and PDF extraction
- **LLM Analysis**: Score publications across 5 dimensions + AI-generated pitch + 5-7-5 haiku via OpenRouter (Claude, DeepSeek, Llama, etc.)
- **Dashboard**: Overview stats, top publications, score distributions, dimensions radar, top keywords
- **Forscher:innen-Ranking**: rank scientists by press-relevance metrics (count of high-score pubs, sum, weighted Bayesian avg, total) with Spotlight-Top-3, FLIP-animated leaderboard, beeswarm distribution, and per-person detail page with co-authors and activity chart
- **InfoBubble system**: ⓘ icons next to every metric, score, badge — hover/tap/keyboard-friendly Popover that explains formulas, data semantics, and caveats. Globally toggleable via the nav bar
- **Hybrid filter pattern**: presets behave as views (replace), individual toggles as modifiers (stack on top), Linear/Notion-style. Empty-state with one-click recovery actions
- **Export**: Download analyzed results as CSV or JSON

## Pages

| Page | Description |
|------|-------------|
| `/` | Dashboard with stats, top publications, score distribution, dimensions radar, keywords |
| `/upload` | WebDB SQL-dump or CSV file upload with preview and dedup |
| `/publications` | Browse, filter, and enrich publications |
| `/publications/[id]` | Full publication detail: pitch, summaries, haiku, score-bars, authors |
| `/researchers` | Forscher:innen-Ranking: Spotlight + Leaderboard + Beeswarm-Verteilung |
| `/persons/[id]` | Person profile: stats, activity chart, co-authors, publication list |
| `/analysis` | View scores, run analysis, export results |
| `/settings` | API keys, model selection, parameters |

## Tech Stack

- **Next.js 16** (App Router, TypeScript, Turbopack)
- **React 19**
- **Supabase** (PostgreSQL with custom PG functions for researcher aggregations)
- **OpenRouter API** (LLM access)
- **Tailwind CSS + shadcn/ui** (Radix primitives)
- **motion / motion-number** (FLIP animations, ticker counters)
- **d3-force** (beeswarm collision layout)
- **nuqs** (URL-bound filter state)
- **PapaParse** (client-side CSV parsing)

## Score Dimensions

| Dimension | Weight | Description |
|-----------|--------|-------------|
| Public Accessibility | 20% | How easily non-experts can understand |
| Societal Relevance | 25% | Impact on health, environment, economy |
| Novelty Factor | 20% | Breakthrough or surprising nature |
| Storytelling Potential | 20% | Journalist narrative potential |
| Media Timeliness | 15% | Connection to current discourse |
