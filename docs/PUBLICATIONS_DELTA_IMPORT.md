# Inkrementeller Publications-Delta-Import

Niedrig-latenter Import der OeAW-Publikationen (und paralleler Events) über die
neuen kanonischen Export-Endpunkte — als Ergänzung zum (weiterhin nötigen)
Voll-Import `scripts/webdb-import.mjs`, nicht als Ersatz.

## Quellen

- **Publications-Delta** (echtes Delta): `https://www.oeaw.ac.at/fileadmin/exports/publications_incremental_change_2.json`
  ```
  { meta:{ generated_at_timestamp, generated_at_readable },
    data:{ records_to_delete:{…}, records_to_add_or_update:{…} } }
  ```
  gruppiert nach den rohen TYPO3-Tabellen `tx_hebowebdb_domain_model_{publication,person,personpublication,orgunitpublication}`.
- **Events-Snapshot** (Upsert-only, kein Delta): `…/event_news_grouped.json` → `scripts/import-events-json.ts` (`npm run import-events-json`).

## Architektur — Logik lebt in Postgres

> Bewusste Entscheidung: die **gesamte relationale Delta-Logik** ist eine DB-
> Funktion. Der TS-Layer normalisiert nur Werte und ruft sie auf.

| Schicht | Verantwortung |
|---|---|
| `scripts/import-publications-delta.ts` (CLI) | CF-gehärteter Fetch, Aufruf der DB-Funktion, danach Matview-Refresh, Logging/WARN |
| `lib/server/ingest/fetch-export.ts` | Fetch mit klarer Cloudflare-/HTML-Diagnose (statt kryptischem Parser-Crash) |
| `lib/server/ingest/adapters/typo3-publications-delta.ts` | **Rein**: Zod-Hüllen-Validierung + Werte-Normalisierung (DOI via `scripts/lib/doi-extract.mjs` — single-sourced, injiziert; Datum/Sentinels; In-Batch-DOI-Dedupe; `deleted:"1"`-Routing) → normalisierte jsonb-Payload |
| **`apply_publications_delta(payload jsonb, opts jsonb) → report jsonb`** | Die ganze relationale Logik, atomar (ein `SELECT` = all-or-nothing) |
| `refresh_publication_ita_subtree(uuid[])` | `is_ita_subtree`-Recompute (scoped/global) — auch vom Voll-Import genutzt (single source) |
| `ingest_runs` | Cursor/High-Water-Mark je Feed (`UNIQUE(feed, generated_at_timestamp)` = Idempotenz) |

Migration: `supabase/migrations/20260710000001_publications_delta_ingest.sql`.

### Was `apply_publications_delta` garantiert
- **Upsert per `webdb_uid`** (Personen, Publikationen); Analyse-/Decision-/`is_ita`-Spalten werden nie überschrieben.
- **FK-Auflösung als INNER JOIN** auf `webdb_uid` (bestehende + im Delta neue Zeilen); nicht auflösbar ⇒ Zeile fällt raus = **Orphan** (gezählt, geloggt, geheilt bei Voll-Reconciliation). Betrifft v. a. Junctions auf **neue Orgunit-Stammsätze**, die der Feed bewusst nicht mitliefert.
- **Deletes**: Publikation → **Soft-Archive** (nie hart; Analyse bleibt; explizites Delete archiviert auch gescorte, außer `--keep-scored-on-delete`). Person → **hart, aber nie** wenn an einer press-gescorten Pub. Junction → real delete. `deleted:"1"` in `add_or_update` wird zum Delete umgeleitet.
- **Guards** (fail-closed): `> max_delta_pubs`/`max_delta_persons` ohne `force` ⇒ Abbruch (Schutz „incremental heimlich zum Volldump"); leere Hülle ⇒ Zod wirft laut.
- **Single-Flight** je Feed via `pg_advisory_xact_lock` (überlappende Cron-Läufe).
- **Idempotenz**: gleicher `generated_at_timestamp` ⇒ `status='skipped'`.
- **is_ita** scoped auf betroffene Pubs; **Bestands-Backfills** (`lead_author`/`published_at`/press-release-promote) nur wenn tatsächlich etwas geändert wurde.
- Matview `publication_oestat6` refresht der **Aufrufer** nach Commit (CONCURRENTLY kann nicht in die Funktion), nur bei `report.matview_dirty`.

## Verwendung

```bash
# lokal, Live-URL, kein Write (voll auflösen + zurückrollen):
npm run import-publications-delta -- --dry-run
# lokale Datei (Test) — mit eigenem Feed, um den Prod-Cursor nicht zu berühren:
npm run import-publications-delta -- --file=./delta.json --feed=test --yes
# Prod, unbeaufsichtigt:
npm run import-publications-delta -- --target=prod --yes
```
Flags: `--file=` / `--url=` / `--target=local|prod` / `--dry-run` / `--yes` /
`--force` (Delta→Volldump-Guard aushebeln) / `--keep-scored-on-delete` /
`--feed=` (Cursor-Schlüssel; Default `publications_incremental_change_2`).

Neue Zeilen landen `analysis_status='pending'` → das bestehende In-Chat-Scoring
greift sie auf. Enrichment/Scoring sind **nicht** Teil dieses Importers.

## ⚠️ Blocker: Cloudflare (Automatik noch offen)

Beide Endpunkte liegen hinter einer **Cloudflare Managed Challenge**
(`cf-mitigated: challenge`, HTTP 403 für serverseitiges `fetch`/`curl`; nur ein
Browser mit Clearance kommt durch). `fetch-export.ts` scheitert daran **laut +
diagnostisch**. Lösung (Reihenfolge = Empfehlung):
1. **WAF-Ausnahme OeAW-seitig** für `/fileadmin/exports/` bzw. die VPS-IP (Florian) — sauber, stabil, null Code.
2. FlareSolverr / Headless-Chrome-Proxy auf der VPS.
3. `cf_clearance`-Cookie — untauglich (IP+UA-gebunden, kurzlebig).

Danach: VPS-Cron (Prod-Secret `PROD_DB_URL_POOLER` injizieren) + **wöchentliche
Voll-Reconciliation** (`webdb-import.mjs`) als Drift-Heilung (der statische
Delta-File ist verlustbehaftet, wenn ein Zyklus verpasst wird). Cron-Wrapper
alarmiert bei Exit ≠ 0 und bei der WARN-Zeile (Orphans/unresolved).

## Prod-Zugang (GOTCHA)

Direkter TLS zum Pooler `db-oeaw.metaspots.net:5432` ist IDS-geblockt (Server-RST):
```bash
ssh -fNL 5433:127.0.0.1:5432 metaspots
# URL: Host→127.0.0.1:5433, für psql/pg_dump sslmode=no-verify → sslmode=require
```
Prod-User = `postgres.dev_tenant` (aus der cred-URL nehmen, nicht raten). Vor
Prod-DDL ein Schema-Backup: `pg_dump … --schema=public --schema-only | gzip`.

## Verifikation

- `npm test` (Adapter-Unit-Tests) · `npx tsc --noEmit` · `node scripts/check-schema-drift.mjs`.
- Lokal E2E: `--dry-run` (Report prüfen) → `--file=… --feed=test --yes` → DB + `ingest_runs`-Report inspizieren → zweiter Lauf = `skipped`.

## Rollback der Migration

Additive Änderung, sauber reversibel:
```sql
DROP FUNCTION IF EXISTS apply_publications_delta(jsonb, jsonb);
DROP FUNCTION IF EXISTS refresh_publication_ita_subtree(uuid[]);
DROP TABLE IF EXISTS ingest_runs;
```
(`webdb-import.mjs` ruft `refresh_publication_ita_subtree(NULL)` — vor dem Drop
dort wieder das Inline-SQL einsetzen.)
