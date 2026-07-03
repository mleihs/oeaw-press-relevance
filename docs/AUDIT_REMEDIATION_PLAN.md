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

### [x] 1.7 Shim aufgelöst (Prämisse war falsch — NICHT 0 Consumer)
- `lib/server/analysis/openrouter.ts` war KEIN toter Shim: es definierte die LIVE-Funktion `analyzePublications`
  (genutzt von `batch.ts:134`) + re-exportierte `calculatePressScore`/`checkKeyBalance`/`estimateCost` als
  Back-Compat-Indirektion. Einziger Consumer: `batch.ts` (kein Test). Statt Blind-Löschen: nach `analysis/analyze.ts`
  umbenannt (parallel zu `events/analyze.ts`, der verwirrende `openrouter`-Name kollidierte mit dem shared
  `@/lib/server/openrouter`), Re-Exports entfernt, `batch.ts` auf echte Quellen umgebogen
  (`analyzePublications`→`./analyze`, `calculatePressScore`→`./score`, `checkKeyBalance`→shared client).
  `estimateCost`-Re-Export war ungenutzt. typecheck+build+451 Tests grün.

---

## PHASE 2 — Mittelfristig (1-3 Tage)

### [x] 2.1 `runEnrichmentBatch` zerlegen (Wartbarkeits-Hotspot)
> DONE (d264376): `seedFromLocalSources` / `finalizeStatus` / `writeEnrichment` /
> `mergePdfIntoAcc` + `enrichNoDoi` / `enrichWithDoi` extrahiert; beide Zweige teilen
> sich `EnrichmentAccumulator`; `!`-Assertions via Narrowing weg; Pacing-Konstanten.
> Keyword-Write bleibt DOI-only (Verhalten bit-erhalten — WebDB-Loader darf
> `enriched_keywords` ohnehin nicht schreiben). +2 No-DOI-Leiter-Tests.
- **Datei:** `lib/server/enrichment/batch.ts:308-585` (~280 Z., zwei Quasi-Duplikat-Zweige: No-DOI 343-426, DOI 428-574).
- **Vorgehen:** Extrahieren: `finalizeStatus(hasAbstract, hasAnyData, counters)`, `writeEnrichment(pub, {...})`,
  `seedFromLocalSources(pub)` (WebDb-Merge + csv-Source-Bookkeeping). Beide Zweige unterscheiden sich danach nur in der
  API/PDF-Kaskade. Non-Null-Assertions `directPdf!`/`pub.doi!` (`:374,471,481`) durch Narrowing auf den Wert ersetzen
  (`if (directPdf) {...}`). Pacing-Magic-Numbers (`:424,573,475`=100, `:502`=200) → benannte Konstanten.
- **Test:** `batch.test.ts` existiert (595 Z.) — muss grün bleiben; Status-Leiter-Fälle ergänzen falls Lücken.
- **Akzeptanz:** Funktion deutlich kürzer, keine `!`-Assertions mehr in dem Block, Tests grün.

### [x] 2.2 Preflight-Balance-Block DRY
> DONE (71381f4): `preflightBalance({ apiKey, total, model, emit })` neben `runLLMBatch`;
> beide Runner rufen es. Reichere Message (mit Key-Limit/Account-Detail) ist Superset der
> Event-Message (identisch wenn Detail leer) → Publication-Frames bit-gleich, Event-Message
> nur reicher. Social bleibt bewusst ohne Gate. +5 Tests (Frame-Order, Masking, Detail).
- Duplikat zwischen `lib/server/analysis/batch.ts:91-135` und `lib/server/events/analyze.ts:85-118`.
- `preflightBalance({ apiKey, total, model, emit })` neben `runLLMBatch`; beide Runner rufen es vor `runLLMBatch`.
- Akzeptanz: ein Preflight-Pfad; SSE-Events (`init`/`error`/`complete`) unverändert für Client.

### [x] 2.3 Cross-Domain-Konsistenz
> DONE (b0c5724): `Event` + `EventLang` (`= Lang | 'mul'`) nach `lib/shared/types.ts`
> (parallel zu `Publication`, KEIN Re-Export — matcht publications/to-api); typo3-events +
> to-api ziehen aus shared; alle 10 Consumer (8 app/events + fetch.ts/list.ts) repointed.
> Scoring-Location: NICHT verschoben — ADR 0020 (publications behält `analysis/`, ADR-0008-
> Maxime). researchers-Divergenz: Notiz in ADR 0009 (decision-#4 Escape-Hatch).
- **`Event`-Typ** `lib/server/events/to-api.ts:13` → nach `lib/shared/types.ts` verschieben; `to-api.ts` re-exportiert.
  3 Client-Importe anpassen: `calendar-event-modal.tsx:22`, `events-calendar.tsx:32`, `event-analysis-card.tsx:10`.
- **Scoring-Location:** entweder Publications-Scoring nach `lib/server/publications/` ODER events/social-Analyzer hoch
  nach `lib/server/analysis/{events,social}.ts`. Empfehlung Audit: Domain-Co-Location. (Größerer Move — abwägen, ggf.
  als ADR dokumentieren statt verschieben.)
- **`researchers`-Divergenz:** entweder in ADR 0009 begründen (Client-Fetch wegen interaktivem Re-Filtern der Viz) ODER
  First-Paint auf RSC angleichen. Minimal: ADR-Notiz. Kein Code-Zwang.

### [x] 2.4 Ingest-/Prod-Sync-Matching in testbare Funktionen
- Pure Matching-/Diff-Logik aus `scripts/push-analysis-to-prod.mjs`, `sync-missing-pubs-to-prod.mjs`,
  `match-external-by-title.mjs` in `lib/server`-Funktionen ziehen; `.mjs` bleibt dünner DB-Wrapper. Unit-Tests dafür.
- Außerdem `lib/server/ingest/upsert.ts` `buildUpsert`/SET-Listen-Konstruktion (pur, kein DB) unit-testen.
> DONE (2 Commits):
> - **2.4a (b06c56c):** `buildUpsertSet(table, updateKeys)` pur aus `upsertBatch` extrahiert
>   (null=DO NOTHING; sonst `{key: excluded.<db-col>}`); +3 Tests (rendert via PgDialect, pinnt
>   camelCase→snake_case der EXCLUDED-Ref).
> - **2.4b (383dba4):** ABWEICHUNG vom Plan-Wortlaut „lib/server" — node-run `.mjs` kann KEIN
>   `lib/server/*.ts` importieren. Stattdessen Präzedenz `scripts/lib/doi-extract.mjs` gefolgt:
>   pure Logik nach `scripts/lib/{title-match,prod-sync}.mjs` (`normTitle`, `isMatchableTitle`,
>   `pickExactTitleMatch`; `setDifference`, `partitionForPush`). Scripts behalten alle Queries/
>   TX/Logs — nur In-Memory-Logik verschoben (wortgleich). vitest-`include` um
>   `scripts/**/*.test.mjs` erweitert; +20 Tests.

---

## PHASE 3 — Versionen (Routine)

### [x] 3.1 Minor/Patch-Bumps
> DONE: `npm update` (npm 11.9.0). Gebumpt u.a. @supabase/supabase-js 2.105→2.109,
> radix-ui 1.4.3→1.6.0, lucide-react 1.16→1.22, motion 12.38→12.42, recharts 3.8→3.9,
> date-fns 4.1→4.4, pg 8.20→8.22, @tanstack/* 5.100→5.101, shadcn 4.7→4.12,
> fumadocs-ui 16.8→16.10, @playwright/test 1.60→1.61, tailwindcss 4.3.0→4.3.2 + Patches.
> NUR package-lock.json geändert (die `^`-Ranges in package.json deckten die neuen Versionen
> bereits ab). `npm outdated` danach: nur noch die 4 bewusst gepinnten (@types/node=3.2,
> eslint/react-day-picker/temporal-polyfill = NICHT bumpen). typecheck+test(481)+build grün.
> 6 moderate Vulns bleiben (transitiv: esbuild in drizzle-kit-Loader, postcss in next) —
> `audit fix --force` würde drizzle-kit→0.18.1 / next→9.3.3 downgraden (Major-Breaking,
> widerspricht „Stack ist aktuell"); pre-existing, kein Major in diesem Update geändert.
- `npm update` deckt ab: @supabase/supabase-js 2.105→2.109, radix-ui 1.4.3→1.6.0, lucide-react 1.16→1.22,
  motion 12.38→12.42, recharts 3.8→3.9, date-fns 4.1→4.4, pg 8.20→8.22, @tanstack/* 5.100→5.101, shadcn 4.7→4.12, u.a.
- Danach `npm run typecheck && npm run test && npm run build`.

### [x] 3.2 `@types/node` 20 → 22 oder 24 (NICHT 26 — kein LTS)
> DONE: `@types/node` `^20`→`^22` (resolved 22.20.0) — auf Vercel-Node 22 angeglichen
> (niedrigste Deploy-Runtime = prod-Floor; verhindert versehentliche Node-23/24-only-APIs
> im App-Code, die auf Vercel brächen). `engines.node` `>=20`→`>=22` mit angehoben
> (konsistent zum neuen Types-Floor; nichts läuft mehr auf Node 20 — Vercel 22, CI+lokal 24;
> advisory, kein .npmrc engine-strict). NICHT 24 gewählt, obwohl lokal/CI 24, weil die
> deployte App auf 22 läuft. Lockfile-Diff exakt auf @types/node beschränkt (5±, keine
> Transitiven). typecheck+test(481)+build (exit 0) grün.
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
