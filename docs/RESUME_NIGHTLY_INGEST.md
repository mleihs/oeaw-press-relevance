# RESUME — Nightly-Ingest/Bewertungs-Feature → nur noch AP3 (Deploy)

Stand 2026-07-16. **AP1 + AP2 sind fertig, committet und live verifiziert.** Offen
ist ausschließlich **AP3 (VPS/Infra/Deploy)**. Diese Datei ist der Pickup-Punkt für
eine frische Session.

## Was fertig ist (AP1 + AP2)

Branch **`feat/nightly-ingest-scoring`** (3 Commits, **nicht gepusht**):
1. `feat(ingest)` — kanonische Scoring-Views (Migration `20260716000001`), Import-
   Runner (Pubs-Delta/Events/Enrichment), Route `POST /api/ingest/run`, DOI nach
   `lib/shared`, Auto-Enrichment beim Import.
2. `feat(scoring)` — `requireUser()` + Run-Lock auf beiden Batch-Routen, Payload
   vereinheitlicht (`scoringBatchPayloadSchema`).
3. `feat(scoring-ui)` — gemeinsames `ScoringModal`, „Bewertung"-Kachel, Alt-Modals
   + Enrichment-UI + Capybara + tote `/api/enrichment/batch`-Route entfernt.

**Live verifiziert:** `status.ts`-SQL gegen prod-nahe lokale DB; Route-Auth
(401 ohne/falschem Bearer; korrekter Bearer läuft); `requireUser` (anon → 401);
Kachel rendert Desktop+Mobile fehlerfrei. tsc + eslint + **659 Unit-Tests** grün.

**Erster AP3-Schritt: Branch reviewen und nach `main` mergen** (davor kein Deploy).

## Wichtige Architektur-Änderungen ggü. dem Originalplan

- **Auto-Enrichment** läuft jetzt als 3. Schritt im Nacht-Import (User-Entscheidung):
  Import → Events → Enrichment. Kein „Anreichern"-Knopf mehr. → Der Nacht-Lauf ist
  **deutlich länger** (Enrichment ruft externe APIs, ~10 s/Pub, bis `INGEST_ENRICH_LIMIT`
  Pubs, Default 200). **Der Cron-`curl` braucht großzügiges `--max-time` (z. B. 45 min)**
  und die systemd-Service darf kein knappes `TimeoutStartSec` haben.
- Neue Env-Var **`INGEST_ENRICH_LIMIT`** (Default 200) zusätzlich zu
  `INGEST_CRON_SECRET` + `OEAW_EXPORT_ORIGIN_IP`.
- Run-Lock nutzt einen **dedizierten Mini-Postgres-Pool** (nicht den max:1-Haupt-Pool).

## AP3-Checkliste (Deploy/Infra)

Namensgebung neutral `oeaw-press-*`. Prod-Schreibzugriff nur via `npm run db:tunnel`
+ `PROD_DB_TUNNEL=1`. Kanonische Prod = **metaspots** (Coolify); Vercel = Hot-Standby.

1. **Branch mergen:** `feat/nightly-ingest-scoring` → `main` (nach Review).
2. **Prod-DDL:** Views `publication_scoring_candidates` / `event_scoring_candidates`
   via Tunnel auf prod anlegen (Migration `20260716000001` einspielen). Prüfen, dass
   `20260710000001` (apply_publications_delta + ingest_runs) auf prod ist.
3. **Coolify-Env** (oeaw-press-tool, uuid siehe unten):
   `INGEST_CRON_SECRET` = `openssl rand -hex 32` · `OEAW_EXPORT_ORIGIN_IP` = IP von
   `voxy.arz.oeaw.ac.at` · `INGEST_ENRICH_LIMIT` (optional) · `OPENROUTER_API_KEY`
   vorhanden? · `DATABASE_URL` = Session-Pooler ✓.
4. **Origin-Pin-Smoke vom VPS:** `curl --resolve www.oeaw.ac.at:443:<IP> <beide Feed-URLs>`
   → JSON, kein `cf-mitigated`. (Bricht der Events-Feed upstream, feuert die Nachtmail
   zu Recht — Redmine #4165.)
5. **`oeaw-press-ingest.timer`** (`OnCalendar=*-*-* 06:00:00 Europe/Vienna`,
   `Persistent=true`, `RandomizedDelaySec=120`) + oneshot-Service →
   `/usr/local/bin/oeaw-press-ingest.sh`: `curl -X POST` mit Bearer auf die prod-URL
   (`--max-time 2700`), `jq -e '.ok'`. **Bei curl-Fehler / non-200 / `ok:false`
   Mail via `curl smtps://` (prossl-Account coolify@metaspots.net) an
   websites@oeaw.ac.at** mit HTTP-Status + Response-JSON; bei Erfolg optional
   Uptime-Kuma-Push. Secrets in `/etc/oeaw-press-ingest/env` (0600). Mail-Kanal liegt
   AUSSERHALB der App → schreit auch bei toter App.
6. **SPECTER2:** Sparse-Shallow-Clone (`scripts/embeddings`) nach
   `/srv/oeaw-press-relevance` + venv (torch CPU, `free -h` prüfen, ~2–3 GB Peak) +
   `/etc/oeaw-press-embeddings/env` mit `PROD_DB_URL_OVERRIDE` (on-box
   `127.0.0.1:5432`, kein Tunnel) + `oeaw-press-embeddings.timer` **06:30**
   Europe/Vienna + `OnFailure=`-Mail-Unit. `--scope=analyzed`, hash-idempotent,
   refresht `press_similarity`. **Kein `--since`** (verpasst sonst pre-2026-Pubs).
7. **Uptime-Kuma:** Push-Monitor „oeaw-press-ingest" (Heartbeat 25 h) + Mail-Notify
   an websites@oeaw.ac.at.
8. **Deploy:** `main` → Vercel (nur push). metaspots = `main` in Branch
   **`chore/coolify-dockerfile`** mergen+pushen (Worktree `coolify-wt`) + Coolify-API-
   Trigger **uuid `cbt2tdcwf10ia0prqk8r45bm`**. (Nur VPS ist kanonisch beschreibbar.)

## Prod-Verifikation (nach Deploy)

- Timer manuell feuern (`systemctl start oeaw-press-ingest.service`) → Response +
  `ingest_runs`-Zeilen (beide Feeds) + Kachel zeigt Datum/Counts.
- **Mail-Pfad einmal absichtlich testen**: falscher Secret in `/etc/.../env` → kommt
  die Mail an websites@oeaw.ac.at an? Danach zurückstellen.
- Kuma-Heartbeat grün; 06:00-Lauf am Folgetag prüfen.

## Referenzen

- SSOT-Plan: `~/.claude/plans/virtual-prancing-coral.md` (§AP3).
- Ops-Runbook: `docs/NIGHTLY_OPS.md` (Response-Shape, Alerting, Runbook „Mail bekommen").
- Prod-Zugang/Branches/Deploy: Memory `[[oeaw-coolify-deploy-branch]]`,
  `[[prod-db-tunnel-and-cloud-mirror]]`, `[[oeaw-canonical-prod-metaspots]]`.
- Lokaler Test-`INGEST_CRON_SECRET` liegt in `.env.local` (gitignored) — nur lokal.

## Gelernt in dieser Session (nicht ingest-spezifisch)

Docker-Desktop-Platte lief voll (Postgres/Docker verklemmten): Ursache waren
**~100 GB verwaiste anonyme Docker-Volumes** (alte pgdata aus `compose down` ohne `-v`).
`docker volume prune -f` gab 113 GB frei (Docker.raw 164 G → 50 G, autotrim). Bei
künftigem „Platte voll ohne Grund" zuerst `docker system df -v` prüfen.
