# Nightly-Ingest/Bewertungs-Feature — AP3 (Deploy) ABGESCHLOSSEN

Stand 2026-07-16. **AP1 + AP2 + AP3 sind fertig und live verifiziert.** Diese Datei
ist jetzt ein **Completion-Record** (kein offener Pickup mehr). Branch
`feat/nightly-ingest-scoring` wurde nach `main` gemergt, gepusht und auf beide
Prod-Ziele deployt.

## Was live ist

Zwei nächtliche systemd-Jobs auf dem VPS **metaspots** (Europe/Vienna):
- **`oeaw-press-ingest.timer` 06:00** → `POST /api/ingest/run` (Bearer
  `INGEST_CRON_SECRET`): Publications-Delta + Events + Auto-Enrichment (bis
  `INGEST_ENRICH_LIMIT=200` Pubs/Nacht). Neue Zeilen landen als Scoring-Kandidaten.
- **`oeaw-press-embeddings.timer` 06:30** → SPECTER2-Embeddings für neue analyzed
  Pubs (hash-idempotent) + `refresh_embedding_pipeline` (press_similarity).

Code auf **Vercel** (`main`) und **metaspots/Coolify** (Branch
`chore/coolify-dockerfile`, App `cbt2tdcwf10ia0prqk8r45bm`, Commit `6989d9b`).

## Zwei Fallstricke, die der Deploy aufdeckte + behob

1. **Cloudflare-100s-Cap (HTTP 524).** Der App-Host liegt hinter Cloudflare; CF
   kappt jede Antwort nach 100 s. Der Enrichment-Lauf dauert ~5 min (200 Pubs,
   ~1,6 s/Pub) → 524-Cut. **Fix:** Der Cron läuft auf derselben Box → der
   Wrapper pinnt den Request per `--resolve <host>:443:127.0.0.1 -k` auf das
   **lokale Traefik** und umgeht Cloudflare ganz (Env `INGEST_RESOLVE`). Der
   standalone-Next-Server erzwingt `maxDuration` NICHT, also läuft der volle
   Request durch. `--max-time 2700` im Wrapper ist die echte Grenze.
2. **`mail_team`-Aufruf fehlte im Fehlerzweig.** Der Alarm-Mail-Versand war
   definiert, aber im Failure-Branch nicht aufgerufen → nur Sentry feuerte, keine
   Mail. Deterministischer Fehlertest (404-URL) deckte es auf → Aufruf verdrahtet,
   Zustellung bestätigt.

## Alerting-Architektur (Hybrid, bewusst gewählt)

- **Sentry Cron-Monitor `oeaw-press-ingest`** (Free-Plan: genau 1 Gratis-Monitor,
  reicht): failed ODER missed Check-in → Issue → Mail an den Projekt-Owner
  (matthias). „Missed" fängt auch toten Timer/tote Box — das kann ein
  In-App/On-Box-Alarm prinzipbedingt nicht. Der Wrapper sendet
  in_progress/ok/error-Check-ins (DSN-Public-Key, kein Auth-Token nötig).
- **prossl-SMTP-Direktmail an `websites@oeaw.ac.at`** zusätzlich im Failure-Branch
  (mit HTTP-Status + Response-JSON). Grund: Sentry-Free kann KEINE freie
  E-Mail-Adresse als Alert-Ziel — nur Member/Team, und Member = kostenpflichtiger
  Seat (in der UI verifiziert). SMTP-Zustellbarkeit an `websites@` vom Team
  bestätigt.
- **SPECTER2** nutzt (wegen des 1-Monitor-Limits) KEINEN Sentry-Cron, sondern
  reine **SMTP-Mail-on-Failure an matthias** (technisches Sekundärsignal).

## VPS-Dateien (NICHT in git — Infra-Config wie die anderen Timer)

- `/etc/oeaw-press-ingest/env` (0600): `INGEST_URL`, `INGEST_CRON_SECRET`,
  `INGEST_RESOLVE`, `SENTRY_*`, `SMTP_*`, `MAIL_TO=websites@oeaw.ac.at`.
- `/usr/local/bin/oeaw-press-ingest.sh` + `oeaw-press-ingest.{service,timer}`.
- `/etc/oeaw-press-embeddings/env` (0600): `PROD_DB_URL_OVERRIDE` (on-box
  `127.0.0.1:5432`, `sslmode=require`), `SMTP_*`, `MAIL_TO=matthias…`.
- `/usr/local/bin/oeaw-press-embeddings.sh` + `oeaw-press-embeddings.{service,timer}`.
- SPECTER2-Clone: `/srv/oeaw-press-relevance` (sparse `scripts/embeddings`) +
  venv (torch 2.12 CPU, transformers 4.57.6, adapters 1.3.0, psycopg2-binary).

## Coolify-Env (App `cbt2tdcwf10ia0prqk8r45bm`)

Neu gesetzt: `INGEST_CRON_SECRET` (64 hex), `OEAW_EXPORT_ORIGIN_IP=193.170.80.13`
(voxy.arz.oeaw.ac.at), `INGEST_ENRICH_LIMIT=200`. `OPENROUTER_API_KEY` war da.

## Prod-DDL

Migration `20260716000001` (Views `publication_scoring_candidates` /
`event_scoring_candidates`) via Tunnel auf prod appliziert.
`apply_publications_delta` + `ingest_runs` waren schon da.

## Verifiziert (2026-07-16)

- End-to-end-Lauf via CF-Bypass: `ok:true`, Enrichment 200 Pubs
  (54 successful / 134 partial / 12 failed), Scoring-Kandidaten 1630 → 1799.
- Sentry-Monitor zeigt ok/failed/ok-Check-ins korrekt; „production ✓".
- Failure-Mail an websites@ (Test) + an matthias (echter Fehlerlauf) zugestellt.
- Origin-Pin beide Feeds 200/JSON, kein `cf-mitigated`.
- SPECTER2: On-Box-DB + Modell + hash-Idempotenz (0 to embed / 8091 skipped) +
  press_similarity-Refresh (centroid_n=154); Service `OK dur=67s`.

## Offene Nebenpunkte (nicht blockierend)

- Enrichment-Rückstand ~25.7k `pending`; drainiert ~200/Nacht. Neue Pubs (Delta)
  werden aber jede Nacht sofort mitgenommen. Kein Handlungsbedarf.
- Events-Feed war zeitweise sehr klein (1 Event) — Upstream-Schwankung
  (Redmine #4165); bricht er ganz, feuert die Nachtmail zu Recht.
