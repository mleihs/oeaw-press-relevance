# OeAW Press Relevance Analyzer

A standalone web application for analyzing Austrian Academy of Sciences (OeAW) publications for press worthiness. Upload CSV exports, enrich metadata via CrossRef/Unpaywall/Semantic Scholar, and score publications using LLM-powered press relevance analysis.

## Quick Start

### 1. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the contents of `supabase-schema.sql`
3. Copy your project URL and anon key from Settings > API

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

- **CSV Upload**: Import publications from HeboWebDB CSV exports with automatic deduplication
- **Enrichment**: Fetch metadata from CrossRef, Unpaywall, and Semantic Scholar
- **LLM Analysis**: Score publications across 5 dimensions using OpenRouter (Claude, DeepSeek, Llama, etc.)
- **Dashboard**: Overview stats, top publications, score distributions
- **Export**: Download analyzed results as CSV or JSON

## Pages

| Page | Description |
|------|-------------|
| `/` | Dashboard with stats and top publications |
| `/upload` | CSV file upload with preview and dedup |
| `/publications` | Browse, filter, and enrich publications |
| `/analysis` | View scores, run analysis, export results |
| `/settings` | API keys, model selection, parameters |

## Tech Stack

- **Next.js 15** (App Router, TypeScript)
- **Supabase** (PostgreSQL, free tier)
- **OpenRouter API** (LLM access)
- **Tailwind CSS + shadcn/ui**
- **PapaParse** (client-side CSV parsing)

## Score Dimensions

| Dimension | Weight | Description |
|-----------|--------|-------------|
| Public Accessibility | 20% | How easily non-experts can understand |
| Societal Relevance | 25% | Impact on health, environment, economy |
| Novelty Factor | 20% | Breakthrough or surprising nature |
| Storytelling Potential | 20% | Journalist narrative potential |
| Media Timeliness | 15% | Connection to current discourse |
