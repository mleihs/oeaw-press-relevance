# Self-Hosting StoryScout

This guide covers running StoryScout on infrastructure you control
(university VM, on-prem cluster, your own DigitalOcean / Hetzner
droplet) instead of Vercel + managed Supabase.

## Architecture

```
[ User ] ──HTTPS──► [ nginx ] ──► [ Next.js Node server (systemd) ]
                                          │
                                          ▼
                                  [ Postgres 17 + pgvector ]

[ cron / systemd timer ] ──► scripts/embeddings/compute-embeddings.py
                                          │
                                          ▼
                                  publication_embeddings,
                                  press_release_embeddings
```

## Prerequisites

- Linux server, 2 vCPU / 4 GB RAM minimum (8 GB recommended if you
  run embedding compute on the same box)
- **Postgres 17** with the `vector` extension
- **Node.js ≥ 20**
- **nginx** (or Caddy / Traefik — anything that handles SSL)
- **Python 3.10+** with `venv` if you want press-similarity scoring

## 1. Postgres + pgvector

Install Postgres 17 from your distro or the official Postgres apt
repo. Then:

```sql
-- as a Postgres superuser
CREATE DATABASE storyscout;
\c storyscout
CREATE EXTENSION IF NOT EXISTS vector;
```

Apply the migrations in chronological order:

```bash
for f in supabase/migrations/*.sql; do
  psql "postgresql://<user>:<pw>@127.0.0.1:5432/storyscout" -f "$f"
done
```

(Or use the Supabase CLI if you've also set up local Supabase — but
it's not required.)

### Backup strategy

```bash
# daily, retain 7
pg_dump --format=custom storyscout > /var/backups/storyscout-$(date +%F).dump
find /var/backups -name 'storyscout-*.dump' -mtime +7 -delete
```

## 2. Build the Next.js Application

```bash
npm ci
npm run build
```

Required env vars in `.env.production` (or your systemd `Environment=`
lines):

```ini
SUPABASE_URL=http://127.0.0.1:54321    # or your self-hosted PostgREST
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=postgresql://user:pw@127.0.0.1:5432/storyscout
OPENROUTER_API_KEY=sk-or-...
GATE_PASSWORD=...
GATE_TOKEN=...   # sha256 of GATE_PASSWORD
```

> **Note on Supabase coupling:** StoryScout uses the Supabase JS
> client for auth + DB calls. The cheapest self-host path is to run
> just the Postgres + PostgREST containers from the Supabase Docker
> Compose, ignoring the rest of the Supabase stack. A truly
> Supabase-free build (e.g. via Drizzle + custom auth) is on the
> roadmap (Phase 3 of OSS_READINESS_PLAN.md).

## 3. systemd Service

`/etc/systemd/system/storyscout.service`:

```ini
[Unit]
Description=StoryScout (Next.js)
After=network.target postgresql.service

[Service]
Type=simple
User=storyscout
WorkingDirectory=/srv/storyscout
EnvironmentFile=/srv/storyscout/.env.production
ExecStart=/usr/bin/node node_modules/.bin/next start -p 3000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now storyscout
sudo journalctl -fu storyscout
```

## 4. nginx Reverse-Proxy

`/etc/nginx/sites-available/storyscout`:

```nginx
server {
  listen 443 ssl http2;
  server_name storyscout.example.org;

  ssl_certificate     /etc/letsencrypt/live/storyscout.example.org/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/storyscout.example.org/privkey.pem;

  # SSE / streaming endpoints need disabled buffering
  proxy_buffering off;
  proxy_read_timeout 300s;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

server {
  listen 80;
  server_name storyscout.example.org;
  return 301 https://$host$request_uri;
}
```

```bash
sudo certbot --nginx -d storyscout.example.org
sudo nginx -t && sudo systemctl reload nginx
```

The `proxy_buffering off` plus `proxy_read_timeout 300s` is required
for the SSE endpoints (`/api/enrichment/batch`, `/api/analysis/batch`)
— without them nginx will buffer the stream until the request ends,
defeating the streaming UX.

## 5. Embedding Pipeline (optional)

Only needed for press-similarity scoring. Schedule via systemd timer
or cron — once-a-night is plenty for most installations.

`/etc/systemd/system/storyscout-embeddings.service`:

```ini
[Unit]
Description=StoryScout embedding compute
After=network.target postgresql.service

[Service]
Type=oneshot
User=storyscout
WorkingDirectory=/srv/storyscout/scripts/embeddings
EnvironmentFile=/srv/storyscout/.env.production
ExecStart=/srv/storyscout/scripts/embeddings/.venv/bin/python compute-embeddings.py --target=local
```

`/etc/systemd/system/storyscout-embeddings.timer`:

```ini
[Unit]
Description=Run StoryScout embedding compute nightly

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl enable --now storyscout-embeddings.timer
```

## 6. Migrations Without the Supabase CLI

```bash
# Applies any migrations newer than what's in the schema_migrations table
for f in supabase/migrations/*.sql; do
  applied=$(psql "$DATABASE_URL" -tAc \
    "SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='$(basename $f .sql | cut -d_ -f1)'")
  if [ -z "$applied" ]; then
    psql "$DATABASE_URL" -f "$f"
  fi
done
```

(The Supabase CLI does this automatically and tracks the
`schema_migrations` table for you. The script above is the bare
fallback.)

## Differences vs Managed-Supabase

| Feature | Managed | Self-Host |
|---|---|---|
| Studio UI | yes | optional (separate `supabase/studio` container) |
| Backups | automatic point-in-time | bring your own (pg_dump cron) |
| SSL termination | automatic | bring your own (Let's Encrypt) |
| Connection pooling | automatic (pgBouncer + pooler) | bring your own (PgBouncer) |
| RLS | yes | yes (Postgres feature, not Supabase-specific) |
| Realtime | yes | requires `supabase/realtime` container |
| Image optimization | Vercel-provided | use `next/image` with `unoptimized: true` or run your own |
| ISR | Vercel-provided | not supported; use a CDN cache layer instead |

## Vercel-Specific Behaviours You'll Lose

- **60-second function timeout** — on self-host you can run SSE
  streams as long as your reverse proxy allows. Adjust
  `proxy_read_timeout` accordingly.
- **Edge runtime** — currently unused in this app, no impact
- **`next/image` with the default loader** — needs the
  `unoptimized: true` flag or your own image-resize service
- **Auto-deploys from `main`** — set up a GitHub Action that
  SSH-pulls + restarts the systemd unit, or use a tool like
  Dokku / Coolify

## Hardening Recommendations

- Keep `GATE_PASSWORD` non-trivial — the gate is anti-bot, not
  proper auth
- Put StoryScout behind your VPN or IP-allowlist if you don't want
  the gate to be the only access barrier
- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS — never expose it client-
  side; the env-var-naming convention in `.env.example` flags this
- Postgres user for the app should have minimum needed grants — at
  least don't run the app as `postgres` superuser
