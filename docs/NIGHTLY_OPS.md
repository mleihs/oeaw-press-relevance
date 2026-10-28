# Nächtlicher Ingest + Bewertung — Ops-Runbook

Stand 2026-10-28 (zuerst 2026-07-16). SSOT für den automatischen Nacht-Import,
das Auto-Enrichment, die Nachtbewertung, die Bewertungs-Status-Kachel und den
„Bewerten"-Knopf.
Die Ops-Dateien der Box sind seit 2026-08-26 in `infra/metaspots/` versioniert
(Abgleich: `bash infra/metaspots/sync-check.sh`).

## Überblick / Datenfluss

```
06:15 Wien: archive-oeaw-exports (Rohexport-Belege, VOR dem Anwenden)
06:30 Wien (systemd-Timer, VPS)
   └─ curl POST https://oeaw-press-tool.metaspots.net/api/ingest/run
        Authorization: Bearer $INGEST_CRON_SECRET
        │
        ├─ 1. Publications-Delta  (apply_publications_delta, atomar in Postgres)
        ├─ 2. Events              (upsertEvents + ingest_runs-Journal, atomar)
        └─ 3. Enrichment          (CrossRef→OpenAlex→Unpaywall→SemanticScholar→PDF)
                                   reichert ausstehende Pubs an → sie werden bewertbar
   → nach Erfolg: systemctl start --no-block oeaw-press-score.service
                  (Sentry-Check-in-id in /run/oeaw-press/checkin-id)

direkt danach (oeaw-press-score.sh, kein Timer)
   └─ curl POST …/api/scoring/run  → 202 {runs:[{id, entity}]}
        │  der Bewertungskern (lib/server/scoring/run.ts) rechnet in der App weiter:
        ├─ 4a. Publikationen   (60-Tage-Fenster, Limit 80)
        └─ 4b. Events          (künftige, Limit 60)
             je Chunk à 25: Bewertung (Opus 5.5, Effort max) → Haiku-Gate mit bis
             zu 2 Nachforderungen (max) → Lektorat (Effort high) → Text-Audit →
             Schreiben mit Tag anthropic/claude-opus-5.5-auto
   └─ Poll GET …/api/scoring/runs/<id> alle 30 s, bis keine Zeile mehr running
   └─ schließt den Check-in der Kette; Alarm nur bei failed
   └─ bewertet wurde etwas → systemctl start oeaw-press-embeddings.service

12:00 Wien (Timer, nur noch Netz)
   └─ SPECTER2-Embeddings, falls die Kette sie nicht schon gestartet hat
```

**Bewertet wird nachts automatisch** (seit 2026-10-28). Das In-Chat-Bewerten
(`/bewerten`) wird zur Nachkontrolle: verworfene Haikus nachtragen, Lektorat-
Hinweise lesen, Zwillinge prüfen. Der Altbestand außerhalb des 60-Tage-Fensters
läuft nachts bewusst nicht mit.

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
  "ok": true,                       // alle feeds ∈ {applied, skipped} && Drift unter der Schwelle
  "degraded": false,                // angewandt, aber mit Drift-Warnungen (kein Alarm)
  "summary": "alle Feeds sauber",   // Einzeiler — wird Sentry-Titel/Mail-Betreff
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
(echter Defekt, s. u.) | `error` (Exception). `ok` ist `false`, sobald ein Feed
nicht in {applied, skipped} liegt oder die Drift die Schwelle reißt.

**Drift-Metrik (korrigiert 2026-08-31).** Personen-Waisen (`person_link_orphans`)
zählen nicht mehr gegen `DRIFT_ALARM_THRESHOLD`: sie sind die Personenlücke der
WebDB selbst (43,5 % der Autorenverknüpfungen zeigen schon in der Quelle ins
Leere, `docs/WEBDB_PERSON_GAP.md` §8), skalieren mit der Größe der Nacht und
lösten am 2026-08-08 mit 80 Fällen einen Fehlalarm aus. Alarm-relevant bleiben
Orgunit-Waisen + unaufgelöste Typangaben (real 0 pro Nacht). Personen-Waisen
erscheinen weiter als Warnung (Lauf ⇒ `degraded`), im Journal und in der
Dashboard-Blase.

**Events-Leerfeed (korrigiert 2026-08-26).** Ein leerer Events-Export ist der
NORMALFALL, nicht der Defekt: der Feed ist ein Delta (uids streng aufsteigend,
nie wiederholt), und TYPO3 legt eine Institutsgruppe nur an, wenn sie mindestens
ein Event trägt. „Nichts Neues" und „Export kaputt" sehen deshalb identisch aus
(`"data": []`). Beleg aus 41 Läufen: 14 leere Nächte (34 %), montags 6 von 6, weil
der Montags-Export das Wochenende abdeckt. Bis zum 26.08. alarmierte jede dieser
Nächte. Jetzt entscheidet nicht mehr eine einzelne Nacht, sondern:

| Signal | Konstante | Verdikt |
|--------|-----------|---------|
| Rohdaten da, alle verworfen | – | `failed` (`all_events_dropped`) |
| Zeitstempel bewegt sich nicht | `FEED_STALE_HOURS` = 36 | `failed` (`feed_stale`) |
| n-te Leernacht in Folge | `EMPTY_FEED_ALARM_STREAK` = 5 | `failed` (`feed_empty_streak`) |
| leer, frisch erzeugt | – | `skipped` (`no_new_events`) |

Die gezählte Serie steht als `report.empty_streak` im Journal. Längste real
beobachtete Leerserie: 3 Nächte.

## Nachtbewertung

- **Routen** (Bearer `INGEST_CRON_SECRET`, gate-öffentlich, `csrf:false`):
  `POST /api/scoring/run` mit Body `{entities?, limit?, dryRun?}` legt je Entität
  eine Journal-Zeile an und antwortet sofort `202 {model, effort, costCapUsd,
  transport, runs}`; `dryRun` ruft kein Modell und zählt nur die Kandidaten.
  `503 {errorClass:'disabled'}` beim Not-Aus, `503` mit Gate-Klasse ohne
  Anthropic-Key (Vercel-Standby). `GET /api/scoring/runs/<id>` liefert Status,
  Zähler, Einzeiler, Fehlerklasse; `GET /api/scoring/runs?latest=1` je Entität
  den letzten und den laufenden Lauf samt Bericht.
- **Journal** `scoring_runs` (Migration 20261028000001): eine Zeile je Entität und
  Lauf, `running` → `ok|partial|failed|skipped`, dazu Kosten, Median, Bericht
  (verworfene Haikus, Lektorat-Hinweise, Batches, Audit vorher/nachher). Eine
  Zeile, die zu lange `running` steht, meldet die Leseseite als abgebrochen:
  Knopf nach 120 min, Nacht und CLI nach 330 min.
- **Transport:** die Nacht über die Message Batches API von Anthropic
  (`lib/server/anthropic-batch.ts`): gleiches Modell, gleiche Parameter, halber
  Preis, dafür Minuten Wartezeit je Runde (Bewertung, Haiku-Nachforderung,
  Lektorat). Frist 300 min je Lauf, danach wird storniert und Fertiges noch
  abgeholt. `SCORING_TRANSPORT=direct` schaltet zurück auf Einzelaufrufe.
- **Effort:** Bewertung und Haiku-Nachforderung max (Gate, kein Schalter nach
  unten), das Lektorat high (`LEKTORAT_EFFORT`, es ändert nur Texte). Mit high
  bewertet lagen Publikationen am 28.10. im Schnitt 0,08 zu hoch.
- **Kosten** (gemessen 28.10., Batch-Preise): Bewertung ~0,25 USD je Publikation
  und ~0,07 je Event, Lektorat ~0,05 je Chunk. Bei ~130 Publikationen und
  ~110 Events im Monat rund 40 USD. Deckel 25 USD je Nacht; eine Nacht mit
  großem Zulauf endet `partial`, der Rest kommt in der Folgenacht.
- **Alarm:** nur `failed` (Check-in error, Sentry-Event `scoring:<error_class>`,
  Mail „[OeAW Scoring] Nachtbewertung fehlgeschlagen"). `partial` und `skipped`
  schließen ok und stehen nur im Journal. Der Sentry-Monitor `oeaw-press-ingest`
  überwacht Ingest und Bewertung zusammen und braucht dafür eine Max Runtime von
  mindestens 6 Stunden.
- **Nachkontrolle:** `PROD_DB_TUNNEL=1 npm run scoring-run -- --target=prod
  --report-latest` zeigt je Entität den letzten Lauf mit verworfenen Haikus und
  Lektorat-Hinweisen.

## Alerting (mehrschichtig)

1. **Nachtmail an websites@oeaw.ac.at** (AUSSERHALB der App, via `curl smtps://`
   prossl-Account): der VPS-Wrapper alarmiert bei curl-Fehler / non-200 / `ok:false`.
   Schreit auch, wenn die App selbst tot ist. (AP3, siehe unten.)
2. **Sentry**: je Feed-Exception ein Event (`seam: ingest_run`); je gescheitertem
   Bewertungslauf eines (`seam: scoring_run` aus der App, `scoring_cron` aus dem
   Wrapper).
3. **Dashboard-Kachel „Bewertung"**: `lastImportFailed` → rote Zeile „Letzter Import
   fehlgeschlagen"; steigende „unbewertet"-Zahlen zeigen Rückstau (älteste ≥ 7 Tage → rot).
4. **Optional Uptime-Kuma Push-Dead-Man** (~25 h Heartbeat).

## Bewertungs-Status-Kachel + „Bewerten"-Fallback

- Kachel: `app/_components/scoring-status-tile.tsx`, Daten aus
  `lib/server/ingest/status.ts` (`getScoringStatus`, **ungecacht** — muss nach einem
  Lauf sofort stimmen). Counts kommen aus den kanonischen Views. Schwelle
  „überfällig" = `SCORING_STALE_DANGER_DAYS` (7) in `lib/shared/dashboard.ts`.
- „Bewerten": gemeinsames `components/scoring-modal.tsx` (entity-parametrisiert).
  Ruft `/api/analysis/batch` (Pubs) bzw. `/api/events/analyze` (Events); beide
  laufen über denselben Bewertungskern wie die Nacht (`lib/server/scoring-route.ts`,
  `lib/server/scoring/button.ts`), aber direkt statt über die Batch-API, weil
  jemand auf das Ergebnis wartet. `requireUser()`, Run-Lock je Entität; ein
  paralleler Lauf kommt als SSE-Frame `skipped` (`lock_busy`), nicht mehr als 409.
- Modell fest: Claude Opus 5.5, Effort max (keine Modellwahl im Modal).

## Kanonische Kandidaten-Views (eine Wahrheit)

`supabase/migrations/20260716000001_scoring_candidate_views.sql`:
- `publication_scoring_candidates`: `archived=false AND analysis_status IN
  ('pending','failed') AND press_score IS NULL AND enrichment_status IN
  ('enriched','partial','failed') AND is_ita_subtree=false AND GREATEST(len(summaries…)) >= 120`.
- `event_scoring_candidates`: `event_at >= now() AND event_score IS NULL`.

Konsumenten: `lib/server/analysis/scoring-adapter.ts` (non-force),
`lib/server/events/scoring-adapter.ts` (non-force), `scripts/session-pipeline.ts`
(Default), `scripts/event-candidates.mjs`,
`lib/server/ingest/status.ts`. Parität zur alten In-Chat-Query lokal verifiziert
(byte-identisch; `is_ita_subtree` == rekursiver ITA-CTE).

## Runbook „Nachtmail bekommen — was nun?"

1. Response-JSON in der Mail lesen: welcher `feed` ist `failed`/`error`?
2. **Events `failed`**: den `reason`-Code lesen. `feed_stale` → der Export wird nicht
   mehr erzeugt, `feed_empty_streak` → er läuft, liefert aber seit 5 Nächten nichts:
   beides upstream (Redmine #4165) → Florian. `all_events_dropped` → Feed-Inhalt und
   Parser driften auseinander, das ist unser Bug. Ein `skipped` mit `no_new_events`
   ist Normalbetrieb und alarmiert nicht mehr.
3. **Publications `error` mit Cloudflare-Meldung**: Origin-Pin prüfen
   (`OEAW_EXPORT_ORIGIN_IP` = aktuelle IP von voxy.arz.oeaw.ac.at). Smoke:
   `curl --resolve www.oeaw.ac.at:443:<IP> <Feed-URL>`.
4. **Enrichment `error`**: externe API down / Rate-Limit → i. d. R. selbstheilend
   im Folgelauf. Bei Dauerfehler `INGEST_ENRICH_LIMIT` senken. Kein Alarmgrund ist
   ein wachsender `pending`-Bestand: das Enrichment nimmt nur Pubs MIT DOI
   (`include_no_doi: false`). Korpusweit bleiben dadurch ~17.700 Sätze dauerhaft
   `pending`, von denen aber nur ~13 überhaupt genug Text zum Bewerten hätten.

5. **Publications `error` mit `exceeds max_delta_pubs`**: der „incremental"-Export ist
   zum Volldump geworden und der fail-closed-Guard hat korrekt abgewiesen (Nacht auf
   den 2026-08-22: 2474 Pubs gegen ein Limit von 2000). Das Delta ist damit KOMPLETT
   verworfen, auch die paar echten Neuzugänge darin. Nachziehen aus dem Rohexport-
   Archiv (`/data/coolify/backups/oeaw-exports/`, 90 Tage) mit `--force`:

   ```
   PROD_DB_TUNNEL=1 npx tsx scripts/import-publications-delta.ts \
     --target=prod --force --yes --file=<archiv>.json
   ```

   Vorher IMMER `--dry-run` (wendet an, rollt zurück) und prüfen, ob sich die uids
   des Archivs mit denen der seither angewandten Deltas überschneiden — sonst
   überschreibt der Replay Neueres mit Älterem.
6. **401/403 in der Mail**: `INGEST_CRON_SECRET` in `/etc/oeaw-press-ingest/env`
   ≠ Coolify-Env. Angleichen. Ein 429 kann seit dem Auth-Reorder vom 2026-08-31
   nicht mehr den legitimen Cron treffen (korrektes Secret gewinnt immer).

### Scoring-Mail bekommen („[OeAW Scoring] …")

Erst `PROD_DB_TUNNEL=1 npm run scoring-run -- --target=prod --report-latest`,
dann nach Fehlerklasse:

- **`auth` / `credits`**: Anthropic-Key in Coolify ungültig oder Guthaben leer.
  Key bzw. Guthaben richten; die Einträge bleiben offen und kommen in der
  Folgenacht.
- **`refusal`**: mindestens zwei Einzelaufrufe abgelehnt. Die Einträge in
  `failed_items` ansehen; meist ein Text, der eine Sicherheitsschranke trifft.
  In-chat bewerten oder liegen lassen.
- **`transport`**: Anthropic oder die Batch-API nicht erreichbar, oder ein
  Batch kam bis zur Frist nicht zurück. Selbstheilend in der Folgenacht; bei
  Wiederholung `SCORING_TRANSPORT=direct` setzen.
- **`max_tokens`**: zwei abgeschnittene Antworten in Folge. Batchgröße senken
  (`SCORING_BATCH_SIZE`), Fall melden.
- **`db`**: Journal oder Schreiben gescheitert; Container-Log und Postgres prüfen.
- **`scoring:http:…` / `scoring:timeout`** (aus dem Wrapper): die Route war nicht
  erreichbar oder ein Lauf stand nach 330 min noch `running` (Container-Neustart
  mitten im Lauf). Journal ansehen, die offenen Einträge kommen in der Folgenacht.

Not-Aus: `SCORING_NIGHTLY_ENABLED=false` in Coolify; der Wrapper schließt den
Check-in dann ok und meldet `DISABLED`.

## Env

| Var | Zweck |
|-----|-------|
| `INGEST_CRON_SECRET` | Bearer fürs Cron (min 32; `openssl rand -hex 32`). Unset → Route 503. |
| `OEAW_EXPORT_ORIGIN_IP` | Cloudflare-Origin-Pin (VPS). Leer → normaler DNS (lokal CF-geblockt). |
| `INGEST_ENRICH_LIMIT` | Enrichment-Obergrenze je Nacht-Lauf (Default 200). |
| `ANTHROPIC_API_KEY` | Bewertung über Anthropic; ohne Key verweigern Nacht und Knopf (503). |
| `SCORING_NIGHTLY_ENABLED` | Not-Aus der Nachtbewertung (Default `true`). |
| `SCORING_TRANSPORT` | `batch` (Default, halber Preis) oder `direct`. |
| `SCORING_NIGHTLY_LIMIT_PUBS` / `_EVENTS` | Obergrenze je Lauf (80 / 60). |
| `SCORING_NIGHTLY_COST_CAP_USD` | Deckel je Nacht, beide Entitäten zusammen (25). |
| `SCORING_BATCH_SIZE` / `SCORING_CONCURRENCY` | Datensätze je Aufruf (5) / gleichzeitige Aufrufe im direkten Modus (2). |

Der VPS-Wrapper `/usr/local/bin/oeaw-press-ingest.sh` und alle übrigen
Ops-Dateien der Box sind seit 2026-08-26 in `infra/metaspots/` versioniert;
Abgleich und Ausroll-Rezept stehen in `infra/metaspots/README.md`.

## AP3 (Deploy/Infra) — erledigt

Seit 2026-07-16 komplett live: Views auf prod, Coolify-Env, `oeaw-press-ingest.timer`
(inzwischen 06:30, s. o.) + Mail-Wrapper, SPECTER2 + `oeaw-press-embeddings.timer`
(seit 2026-10-28 nur noch Netz um 12:00; regulär startet die Bewertung die
Embeddings). Die Unit-/Skript-Wahrheit liegt in `infra/metaspots/`.
