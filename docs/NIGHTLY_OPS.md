# Nächtlicher Ingest + Bewertungs-Fallback — Ops-Runbook

Stand 2026-07-16. SSOT für den automatischen Nacht-Import, das Auto-Enrichment,
die Bewertungs-Status-Kachel und den „Bewerten"-Fallback.

## Überblick / Datenfluss

```
06:00 Wien (systemd-Timer, VPS)
   └─ curl POST https://oeaw-press-tool.metaspots.net/api/ingest/run
        Authorization: Bearer $INGEST_CRON_SECRET
        │
        ├─ 1. Publications-Delta  (apply_publications_delta, atomar in Postgres)
        ├─ 2. Events              (upsertEvents + ingest_runs-Journal, atomar)
        └─ 3. Enrichment          (CrossRef→OpenAlex→Unpaywall→SemanticScholar→PDF)
                                   reichert ausstehende Pubs an → sie werden bewertbar
   → KEIN Auto-Scoring. Bewertet wird bevorzugt In-Chat (Opus, €0);
     der „Bewerten"-Button ist der OpenRouter-Fallback.

06:30 Wien (separater Timer)
   └─ SPECTER2-Embeddings für gescorte Pubs (AP3, on-box)
```

**Warum kein Scoring im Cron:** Das In-Chat-Scoring (Redaktion, Opus, kostenlos)
ist der bevorzugte, kalibrierte Weg. Der Nacht-Cron bereitet nur vor (importieren
+ anreichern); das Bewerten passiert bei Bedarf.

**Warum Enrichment im Cron:** „Nur enrichen ohne zu bewerten" ergab keinen Sinn —
Enrichment ist reine Vorstufe zum Scoring (die Kandidaten-View verlangt
`enrichment_status IN ('enriched','partial','failed')` + 120-Zeichen-Content-Gate).
Deshalb läuft es automatisch beim Import; einen manuellen „Anreichern"-Knopf gibt
es nicht mehr.

## Endpunkt `POST /api/ingest/run`

- **Auth:** `Authorization: Bearer <INGEST_CRON_SECRET>` (konstante-Zeit-Vergleich,
  `lib/server/ingest/cron-auth.ts`). KEIN Login, KEIN Gate-Cookie (Route in
  `PUBLIC_PATHS`). `INGEST_CRON_SECRET` unset → **503** (Feature aus). Falsch/fehlend
  → **401**. > 5 Fehlversuche / 15 min pro IP → **429**.
- **CSRF:** aus (`withApiError(handler, { csrf: false })`) — Maschinen-Cron ohne Browser-Origin.
- **Ablauf:** beide Feeds + Enrichment **sequenziell**, je eigenes try/catch (ein
  Fehler stoppt die anderen nicht); je Fehler `Sentry.captureException` mit
  `tags: { seam: 'ingest_run', feed }`.
- **Immer HTTP 200**, sobald die Route lief. Response:

```jsonc
{
  "ok": true,                       // alle feeds ∈ {applied, skipped} && keine warnings
  "startedAt": "2026-07-16T04:00:00.000Z",
  "durationMs": 812345,
  "feeds": {
    "publications_incremental_change_2": { "status": "applied", "report": { … }, "warnings": [], "matviewRefreshed": true, "durationMs": … },
    "event_news_grouped":                { "status": "applied", "imported": 3, "updated": 1, "parsed": 12, "durationMs": … },
    "enrichment":                        { "status": "applied", "pubs": 30, "successful": 24, "partial": 4, "failed": 2, "durationMs": … }
  }
}
```

`status` je Feed: `applied` | `skipped` (Idempotenz / nichts anzuwenden) | `failed`
(z. B. Events-Feed lieferte 0 Zeilen, Redmine #4165) | `error` (Exception). `ok` ist
`false`, sobald ein Feed nicht in {applied, skipped} liegt oder Warnungen trägt.

## Alerting (mehrschichtig)

1. **Nachtmail an websites@oeaw.ac.at** (AUSSERHALB der App, via `curl smtps://`
   prossl-Account): der VPS-Wrapper alarmiert bei curl-Fehler / non-200 / `ok:false`.
   Schreit auch, wenn die App selbst tot ist. (AP3, siehe unten.)
2. **Sentry**: je Feed-Exception ein Event (`seam: ingest_run`).
3. **Dashboard-Kachel „Bewertung"**: `lastImportFailed` → rote Zeile „Letzter Import
   fehlgeschlagen"; steigende „unbewertet"-Zahlen zeigen Rückstau (älteste ≥ 7 Tage → rot).
4. **Optional Uptime-Kuma Push-Dead-Man** (~25 h Heartbeat).

## Bewertungs-Status-Kachel + „Bewerten"-Fallback

- Kachel: `app/_components/scoring-status-tile.tsx`, Daten aus
  `lib/server/ingest/status.ts` (`getScoringStatus`, **ungecacht** — muss nach einem
  Lauf sofort stimmen). Counts kommen aus den kanonischen Views. Schwelle
  „überfällig" = `SCORING_STALE_DANGER_DAYS` (7) in `lib/shared/dashboard.ts`.
- „Bewerten": gemeinsames `components/scoring-modal.tsx` (entity-parametrisiert,
  Design = Social-Refresh-Modal). Ruft `/api/analysis/batch` (Pubs) bzw.
  `/api/events/analyze` (Events). Beide Routen: `requireUser()` + Run-Lock
  (`lib/server/run-lock.ts`, `pg_try_advisory_lock`) → paralleler Lauf = **409**.
- Modell-Defaults: Pubs `anthropic/claude-sonnet-4`, Events `deepseek/deepseek-chat`.

## Kanonische Kandidaten-Views (eine Wahrheit)

`supabase/migrations/20260716000001_scoring_candidate_views.sql`:
- `publication_scoring_candidates`: `archived=false AND analysis_status IN
  ('pending','failed') AND press_score IS NULL AND enrichment_status IN
  ('enriched','partial','failed') AND is_ita_subtree=false AND GREATEST(len(summaries…)) >= 120`.
- `event_scoring_candidates`: `event_at >= now() AND event_score IS NULL`.

Konsumenten: `lib/server/analysis/batch.ts` (non-force), `lib/server/events/analyze.ts`
(non-force), `scripts/session-pipeline.mjs` (Default), `scripts/event-candidates.mjs`,
`lib/server/ingest/status.ts`. Parität zur alten In-Chat-Query lokal verifiziert
(byte-identisch; `is_ita_subtree` == rekursiver ITA-CTE).

## Runbook „Nachtmail bekommen — was nun?"

1. Response-JSON in der Mail lesen: welcher `feed` ist `failed`/`error`?
2. **Events `failed` / `parsed:0`**: Feed upstream leer/kaputt (Redmine #4165) → Florian.
   Kein App-Bug; die Mail ist gewolltes Schreien.
3. **Publications `error` mit Cloudflare-Meldung**: Origin-Pin prüfen
   (`OEAW_EXPORT_ORIGIN_IP` = aktuelle IP von voxy.arz.oeaw.ac.at). Smoke:
   `curl --resolve www.oeaw.ac.at:443:<IP> <Feed-URL>`.
4. **Enrichment `error`**: externe API down / Rate-Limit → i. d. R. selbstheilend
   im Folgelauf. Bei Dauerfehler `INGEST_ENRICH_LIMIT` senken.
5. **401/403 in der Mail**: `INGEST_CRON_SECRET` in `/etc/oeaw-press-ingest/env`
   ≠ Coolify-Env. Angleichen.

## Env

| Var | Zweck |
|-----|-------|
| `INGEST_CRON_SECRET` | Bearer fürs Cron (min 32; `openssl rand -hex 32`). Unset → Route 503. |
| `OEAW_EXPORT_ORIGIN_IP` | Cloudflare-Origin-Pin (VPS). Leer → normaler DNS (lokal CF-geblockt). |
| `INGEST_ENRICH_LIMIT` | Enrichment-Obergrenze je Nacht-Lauf (Default 200). |

## Offen (AP3 — Deploy/Infra, separat)

Prod-DDL der Views via Tunnel · Coolify-Env setzen · systemd `oeaw-press-ingest.timer`
06:00 + Mail-Wrapper · SPECTER2-Clone/venv + `oeaw-press-embeddings.timer` 06:30 ·
Uptime-Kuma. Details im Plan `~/.claude/plans/virtual-prancing-coral.md` §AP3.
