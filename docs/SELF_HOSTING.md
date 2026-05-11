# Self-Hosting StoryScout

This guide covers running StoryScout on infrastructure you control
(university VM, on-prem cluster) without Vercel + Supabase managed.

> **Status:** stub. Full content lands in Phase 1 / Block 2 of
> [OSS_READINESS_PLAN.md](../OSS_READINESS_PLAN.md).

## Architecture

```
[ User ] ──HTTPS──► [ nginx ] ──► [ Next.js Node server ]
                                         │
                                         ▼
                                  [ Postgres + pgvector ]
```

## Prerequisites

- Linux server with at least 2 CPU / 4 GB RAM
- Postgres 17 with `vector` extension
- Node.js ≥ 20
- (optional) Python 3.10+ for SPECTER2 embedding pipeline

## Postgres + pgvector

```sql
CREATE EXTENSION IF NOT EXISTS vector;
-- then apply migrations:
-- psql -f supabase/migrations/*.sql in chronological order
```

## Build & Run Next.js

```bash
npm ci
npm run build
NODE_ENV=production npm run start
```

Required env vars: see `.env.example`. `DATABASE_URL`,
`SUPABASE_URL`/`SUPABASE_ANON_KEY` (point at your self-hosted Supabase
or any Postgres-with-PostgREST equivalent), `OPENROUTER_API_KEY`,
`GATE_PASSWORD` + `GATE_TOKEN`.

## nginx Reverse-Proxy

[Sample config — SSL termination via Let's Encrypt, optional basic-auth
layer on top of the password-gate.]

## Embedding Pipeline (optional)

Only needed for press-similarity. Schedule via cron or systemd timer —
see [WEBDB_IMPORT.md](WEBDB_IMPORT.md) for the data-prep prerequisite.

## Differences vs Managed-Supabase

| Feature | Managed | Self-Host |
|---|---|---|
| Studio UI | yes | optional (separate deploy) |
| Backups | automatic | bring your own (pg_dump cron) |
| SSL | automatic | bring your own (Let's Encrypt) |
| RLS | yes | yes (Postgres feature) |
| Realtime | yes | requires Supabase Realtime container |
