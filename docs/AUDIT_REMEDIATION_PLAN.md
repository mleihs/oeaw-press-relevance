# Audit Remediation Plan (2026-06-30)

Quelle: Deep-Audit (Architektur, Code-Qualität, Duplication, Security, Performance, Testing, Versionen).
Status-Konvention: `[ ]` offen · `[x]` erledigt · `[~]` teilweise. Beim Abarbeiten hier abhaken.

Reihenfolge ist nach Hebel/Risiko sortiert. Jeder Punkt hat: Dateien, Vorgehen, Akzeptanzkriterium.
Nach jedem abgeschlossenen Punkt: `npm run typecheck && npm run test` grün halten. Erst committen, wenn der
Punkt vollständig + getestet ist (keine Sammelcommits über mehrere Punkte).

---

## PHASE 1 — Quick wins, höchster Hebel (~1 Tag)

### [x] 1.1 Press-Score-Formel vereinheitlichen (Korrektheit + Drift) ⭐ ZUERST
- **Problem:** `calculatePressScore()` in `lib/server/analysis/score.ts:24` (produktiv: batch.ts, openrouter.ts,
  scripts/session-pipeline.mjs) ist eine handgerollte Schleife mit eigener Rundung. `computePressScore()` →
  `weightedScore()` in `lib/shared/scoring.ts` macht dasselbe, ist getestet (`scoring.test.ts`), aber toter Code.
  Rundung differiert bereits.
- **Vorgehen:** `calculatePressScore` an `weightedScore` delegieren:
  `Math.round(weightedScore(dims, SCORE_WEIGHTS) * 10000) / 10000`. `computePressScore` entweder löschen oder als
  Rundungs-Wrapper behalten — EIN Pfad. `SCORE_WEIGHTS`-Quelle prüfen (darf nicht doppelt definiert sein).
- **Achtung:** Rundungs-Paritätstest. Vorher die aktuelle Rundung von `calculatePressScore` als Snapshot festhalten,
  damit produktive Scores sich NICHT ändern (sonst müsste man neu scoren).
- **Test:** Unit-Test für `calculatePressScore` ergänzen (pur, trivial) — gleiche Inputs → gleiche Outputs wie vorher.
- **Akzeptanz:** Eine Formel, getestet; `npm run test` grün; bestehende Scores bit-identisch.

### [x] 1.2 `upsertEvents`-Test (sichert aktuell UNCOMMITTETEN Diff) ⭐
- **Problem:** `lib/server/events/sync.ts` `upsertEvents` (neu, uncommitted) ist der einzige Schreibpfad für beide
  Event-Ingest-Wege (WEBDB-MySQL + neuer `scripts/import-events-json.ts`). Vertrag: SET-Liste lässt Maintainer-Spalten
  (`decision`, `decided_at`, `flag_notes`, `created_at`) + LLM-Scores aus → Re-Sync zerstört keine Triage. Ungetestet.
- **Vorgehen:** Test gegen Test-Postgres oder Transaction-Rollback-Fixture. Muster wie bestehende DB-nahe Tests im Repo
  prüfen (`rg "transaction|rollback|pg-mem|test.*db" lib/server --type ts`).
- **Test-Fälle:** (a) Insert → status `imported`; (b) Re-Run mit geänderten Inhaltsfeldern → `updated` UND
  `decision`/`decided_at`/`flag_notes`/`created_at` + LLM-Scores unverändert; (c) inserted/updated-Counts korrekt
  (`xmax = 0`-Accounting).
- **Akzeptanz:** Test pinnt den Maintainer-Spalten-Schutz; würde rot, wenn jemand eine Spalte in die SET-Liste aufnimmt.

### [x] 1.3 `flag.ts`-Duplikat zusammenführen
- **Problem:** `lib/server/events/flag.ts` und `lib/server/publications/flag.ts` sind byte-identisch in `norm()`,
  `defaultBy()`, setFlag/clearFlag-Dedup-Logik. Einziger Unterschied: Persistenz (events inline Drizzle, publications via
  `publicationsRepo`).
- **Vorgehen:** Generisches `lib/server/flag-notes.ts` mit `setFlagNote({ readNotes, writeNotes, notFound }, payload)` /
  `clearFlagNote(...)`. Jede Domain wird ~10-Zeilen-Wrapper, der ihr read/write injiziert.
- **Test:** vorhandene Flag-Tests (falls da) müssen grün bleiben; sonst kurzen Unit-Test für die generische Dedup-Logik.
- **Akzeptanz:** Eine Implementierung, beide Domains binden nur Backend.

### [x] 1.4 Script-Boilerplate DRY: `confirmProd()` + `redactedDatabaseUrl()`
- **Problem:** Wortgleich in `scripts/sync-events.ts`, `scripts/analyze-events.ts`, `scripts/sync-social.ts`,
  `scripts/import-events-json.ts`. `parseScriptArgs`/`loadDbUrl` liegen bereits in `scripts/lib/db.mjs`.
- **Vorgehen:** `redactedDatabaseUrl()` und `confirmProd({ isProd, flags, label })` nach `scripts/lib/db.mjs`; 4 lokale
  Kopien löschen und importieren. ACHTUNG: `.ts`-Scripts importieren aus `.mjs` — Import-Pfad/Interop prüfen (tsx).
- **Akzeptanz:** Keine Duplikate mehr; alle 4 Scripts laufen (zumindest `--help`/Dry-Run-Pfad).

### [x] 1.5 `server-only`-Guard auf Server-Entry-Module
> Umgesetzt auf die 4 reinen RSC-Read-Entries: `events/list`, `events/fetch`, `orgunits/list`,
> `social/list`. BEWUSST ausgeschlossen (werden von Node-CLI gezogen, `server-only` würde dort
> werfen): `db/index.ts` (alle Scripts), `publications/list`+`publications/fetch`+`press-releases/list`+
> `dashboard/fetch` (RSC-Smoke-Scripts `scripts/smoke/rsc/*`). Vitest-Resolve aliast `server-only`
> auf einen No-op-Stub (`test/server-only-shim.ts`). `server-only` ist KEIN npm-Dep — Next aliast es
> beim Build, tsc löst via Next-Typen auf.
- **Problem:** Client/Server-Lint-Grenze nicht erzwungen; Backstop `import 'server-only'` nur in 4/82 Modulen.
- **Vorgehen:** `import 'server-only';` an den Kopf von: `lib/server/db/index.ts`, jeder `lib/server/*/list.ts`,
  `lib/server/dashboard/fetch.ts` (und weitere `fetch.ts`). NICHT in Module, die legitim von Scripts (Node-CLI) genutzt
  werden — die würden brechen. Erst prüfen: `rg "from '@/lib/server" scripts` bzw. welche Server-Module Scripts ziehen.
- **Akzeptanz:** `npm run build` grün; ein Test-Import einer dieser Module in eine Client-Komponente bricht jetzt mit
  klarer `server-only`-Meldung.

### [x] 1.6 Events-Liste: Spaltenprojektion (einziger echter Perf-Win)
- **Problem:** `lib/server/events/list.ts:189` `db.select().from(eventsTable)` zieht alle Spalten inkl.
  `bodytext`/`event_information` (Multi-KB-HTML) + LLM-Prosa (`reasoning`, `pitch_suggestion`, `suggested_angle`,
  `target_audience`), die Liste/Kalender nie rendern → tote KB im RSC-Payload pro Zeile.
- **Vorgehen:** List-spezifische Projektion (`db.select({...})` oder `columns:` via `db.query`) mit nur den real
  genutzten Spalten (siehe Audit: title, teaser, event_at, event_end_at, institute, location_title, organizer_title,
  event_score, decision, analysis_status, available_langs, flag_notes, url). `eventRowToApi` ggf. anpassen/splitten;
  Detail-/Analyze-Surface lädt Vollzeile on demand.
- **Akzeptanz:** `/events` rendert unverändert; Payload kleiner; Detail/Analyze funktioniert weiter.

### [ ] 1.7 Toten Shim löschen
- `lib/server/analysis/openrouter.ts` (39 Z., 0 Consumer). Vorher verifizieren: `rg "analysis/openrouter" lib app scripts`
  → 0 Treffer. `batch.ts` importiert bereits aus `@/lib/server/openrouter`. Dann löschen.

---

## PHASE 2 — Mittelfristig (1-3 Tage)

### [ ] 2.1 `runEnrichmentBatch` zerlegen (Wartbarkeits-Hotspot)
- **Datei:** `lib/server/enrichment/batch.ts:308-585` (~280 Z., zwei Quasi-Duplikat-Zweige: No-DOI 343-426, DOI 428-574).
- **Vorgehen:** Extrahieren: `finalizeStatus(hasAbstract, hasAnyData, counters)`, `writeEnrichment(pub, {...})`,
  `seedFromLocalSources(pub)` (WebDb-Merge + csv-Source-Bookkeeping). Beide Zweige unterscheiden sich danach nur in der
  API/PDF-Kaskade. Non-Null-Assertions `directPdf!`/`pub.doi!` (`:374,471,481`) durch Narrowing auf den Wert ersetzen
  (`if (directPdf) {...}`). Pacing-Magic-Numbers (`:424,573,475`=100, `:502`=200) → benannte Konstanten.
- **Test:** `batch.test.ts` existiert (595 Z.) — muss grün bleiben; Status-Leiter-Fälle ergänzen falls Lücken.
- **Akzeptanz:** Funktion deutlich kürzer, keine `!`-Assertions mehr in dem Block, Tests grün.

### [ ] 2.2 Preflight-Balance-Block DRY
- Duplikat zwischen `lib/server/analysis/batch.ts:91-135` und `lib/server/events/analyze.ts:85-118`.
- `preflightBalance({ apiKey, total, model, emit })` neben `runLLMBatch`; beide Runner rufen es vor `runLLMBatch`.
- Akzeptanz: ein Preflight-Pfad; SSE-Events (`init`/`error`/`complete`) unverändert für Client.

### [ ] 2.3 Cross-Domain-Konsistenz
- **`Event`-Typ** `lib/server/events/to-api.ts:13` → nach `lib/shared/types.ts` verschieben; `to-api.ts` re-exportiert.
  3 Client-Importe anpassen: `calendar-event-modal.tsx:22`, `events-calendar.tsx:32`, `event-analysis-card.tsx:10`.
- **Scoring-Location:** entweder Publications-Scoring nach `lib/server/publications/` ODER events/social-Analyzer hoch
  nach `lib/server/analysis/{events,social}.ts`. Empfehlung Audit: Domain-Co-Location. (Größerer Move — abwägen, ggf.
  als ADR dokumentieren statt verschieben.)
- **`researchers`-Divergenz:** entweder in ADR 0009 begründen (Client-Fetch wegen interaktivem Re-Filtern der Viz) ODER
  First-Paint auf RSC angleichen. Minimal: ADR-Notiz. Kein Code-Zwang.

### [ ] 2.4 Ingest-/Prod-Sync-Matching in testbare Funktionen
- Pure Matching-/Diff-Logik aus `scripts/push-analysis-to-prod.mjs`, `sync-missing-pubs-to-prod.mjs`,
  `match-external-by-title.mjs` in `lib/server`-Funktionen ziehen; `.mjs` bleibt dünner DB-Wrapper. Unit-Tests dafür.
- Außerdem `lib/server/ingest/upsert.ts` `buildUpsert`/SET-Listen-Konstruktion (pur, kein DB) unit-testen.

---

## PHASE 3 — Versionen (Routine)

### [ ] 3.1 Minor/Patch-Bumps
- `npm update` deckt ab: @supabase/supabase-js 2.105→2.109, radix-ui 1.4.3→1.6.0, lucide-react 1.16→1.22,
  motion 12.38→12.42, recharts 3.8→3.9, date-fns 4.1→4.4, pg 8.20→8.22, @tanstack/* 5.100→5.101, shadcn 4.7→4.12, u.a.
- Danach `npm run typecheck && npm run test && npm run build`.

### [ ] 3.2 `@types/node` 20 → 22 oder 24 (NICHT 26 — kein LTS)
- An Deploy-Runtime angleichen (Vercel Node 22, lokal 24). `engines.node` (`>=20`) ggf. mit anheben.

### [ ] NICHT bumpen (bewusst):
- **temporal-polyfill** 0.3.0 → 1.0.1: Schedule-X v4 hat harte exakte Peer-Dep `0.3.0`. Erst wenn Schedule-X nachzieht.
- **eslint** 9 → 10: `eslint-config-next` gegen 9 getestet; 10 zu neu. Warten.
- **react-day-picker** 9 → 10: optional, breaking; nur shadcn-Calendar-Wrapper. Kein Druck.
- Framework-Stack (next 16.2, react 19.2, tailwind 4.3, drizzle 0.45, zod 4) ist aktuell.

---

## Sicherheit (Low, intern — separat / optional)
- Single-Shared-Password-Gate: ungenutzte `users`/roles-Tabelle (`schema.ts:16`) existiert; nur wiring falls
  User-Attribution/Offboarding je gebraucht. Mindestens Rotations-Prozedur dokumentieren.
- SSRF in `lib/server/enrichment/pdf-extract.ts:9-21`: Regex blockt nur Literal-IPs, nicht auflösende Hostnames.
  Resolved-IP-Re-Check vor Fetch — niedrige Priorität (vertrauenswürdige akademische APIs, 15s/10MB-Bounds).
