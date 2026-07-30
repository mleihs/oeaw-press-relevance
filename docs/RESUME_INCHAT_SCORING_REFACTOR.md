# In-Chat-Bewertung aufräumen — ERLEDIGT 2026-07-30

> **Abschlussvermerk.** AP A, B und C sind umgesetzt und verifiziert; alle acht
> Verifikationspunkte sind durchlaufen. Der laufende Ablauf steht ab jetzt in
> **`docs/INCHAT_SCORING.md`**, der Einstieg ist `/bewerten`. Der Slash-Befehl
> `/resume-scoring-refactor` ist entfernt. Was unten steht, ist der ursprüngliche
> Plan; er bleibt als Begründung stehen. Abweichungen und Nebenbefunde stehen im
> Abschnitt „Wie es ausgegangen ist" ganz unten.

Stand 2026-07-30. Arbeitsplan, geschrieben mit vollem Kontext — eine frische
Sitzung soll die Befunde **nicht neu herleiten müssen**. Alle Zahlen unten sind
gemessen, nicht geschätzt.

## Warum überhaupt

Die In-Chat-Bewertung funktioniert, aber ihre Bedienung ist mit zwei
„Stolperstellen" dokumentiert, die in Wahrheit **Bugs sind, keine Naturgesetze**.
Solange die Doku davor warnt, statt sie zu beheben, zementiert sie die Fehler.

`docs/PUBLICATIONS_INCHAT_SCORING.md` (Abschnitt „Stand 2026-07-21") nennt:

1. **`sslmode` von Hand auf `no-verify` umschreiben**, sonst
   `self-signed certificate`.
2. **`--imported-after` ist Pflicht**, sonst scort man den Altbestand aus 2023
   statt der frischen Eingänge.

Beide entstehen an derselben Stelle: `scripts/session-pipeline.mjs` ist das
**einzige** Bewertungsskript, das die geteilte DB-Schicht `scripts/lib/db.mjs`
nicht benutzt. Es baut seinen `pg.Client` roh aus `PG_DATABASE_URL`.

## Gemessener Ist-Zustand (2026-07-30)

Härtung im Vergleich zum Geschwisterskript:

| | `session-pipeline.mjs` | `apply-event-scores.ts` |
|---|---|---|
| Dry-run per Default | ✅ | ✅ |
| Überschreibschutz | ✅ `press_score IS NULL` | ✅ `event_score IS NULL` |
| `--force` | ✅ | ✅ |
| `confirmProd` vor Prod-Write | ❌ | ✅ |
| Sentry | ❌ | ✅ |
| `scripts/lib/db.mjs` | ❌ | ✅ |
| `--target` | ❌ (nur rohe Env) | ✅ |

`scripts/lib/db.mjs` bietet bereits alles Nötige: `loadDbUrl`, `connectDb`,
`parseScriptArgs`, `redactedDatabaseUrl`, `confirmProd`. **`connectDb` löst die
sslmode-Falle nachweislich schon** — es setzt ein verbindungsgebundenes
`rejectUnauthorized:false`, strippt `sslmode` aus der URL, damit node-pg die
Konfiguration nicht neu ableitet, und kennt `PROD_DB_TUNNEL`. Im Code steht ein
Kommentar, der genau diesen Fall erklärt.

Das 60-Tage-Fenster ist ebenfalls längst kanonisch:
`SCORING_RECENT_DAYS = 60` in `lib/shared/dashboard.ts`.

## Refactor-Befunde in `session-pipeline.mjs` (1172 Zeilen, 8 Subcommands)

Belegt durch Referenzsuche über `*.md`, `*.json`, `*.ts`, `*.mjs`, `*.sh`:

1. **`haiku-patch` ist toter Code.** Zeilen 895–1034 plus
   `ASCII_REPLACEMENT_WORDS` (862) und `validateNewHaiku` (875) — zusammen ~175
   Zeilen, also 15 % der Datei. **Nirgends referenziert**, auch nicht in
   `package.json` oder `docs/HANDOVER.md`. Ersatzlos entfernen.
2. **`calculatePressScore` existiert dreifach.** `session-pipeline.mjs:69`,
   `lib/server/analysis/score.ts:25`, `lib/shared/scoring.ts:44`
   (als `computePressScore`). Die **Gewichte** sind bereits single-sourced
   (`lib/shared/score-weights.json`), die **Funktion** nicht. Bei
   Bewertungslogik ist das die gefährlichste Sorte Duplikat.
3. **Eigenes `parseArgs` (80) und `withClient` (101)** duplizieren
   `parseScriptArgs` und `connectDb` aus der geteilten Lib.
4. **`enrich-api` (377–536) und `enrich-augment` (538–671)**, ~300 Zeilen
   OpenRouter-Anreicherung, sind nur noch in `docs/HANDOVER.md` erwähnt. Seit
   dem Nacht-Ingest (`runEnrichmentImport`, 06:30) macht das der Cron.
   **Vor dem Löschen prüfen**, ob der Cron-Pfad funktional deckungsgleich ist —
   nicht blind entfernen.
5. **Pubs und Events haben dieselbe Form**, aber getrennten Code:
   Kandidaten aus kanonischer View → JSON → validieren → geschützter Write.
   `session-pipeline candidates|apply` gegenüber `event-candidates.mjs` +
   `apply-event-scores.ts`. Ein gemeinsamer Kern ist möglich, aber **optional** —
   erst nach A/B/C bewerten, nicht vorwegnehmen.

## AP A — `session-pipeline.mjs` auf das Niveau des Geschwisters heben

Kein Neuschreiben der 1172 Zeilen. Die Anbindung tauschen:

- `parseScriptArgs()` → `--target=local|prod`, Default `local`.
- `connectDb({ target })` statt `PG_URL`/`withClient`. Damit entfallen der
  manuelle `export PG_DATABASE_URL` und die sslmode-Umschreibung ersatzlos.
  **`PG_DATABASE_URL` als Override erhalten**, damit bestehende Aufrufe
  (u. a. `scripts/push-analysis-to-prod.mjs`) nicht brechen.
- `confirmProd({ isProd, flags, label })` vor jedem Prod-Write in `cmdApply`.
- `initScriptSentry('session-pipeline')` + `captureScriptError` wie in
  `apply-event-scores.ts`.
- `cmdCandidates`: Default-Fenster = `SCORING_RECENT_DAYS` (importiert aus
  `lib/shared/dashboard.ts`, **nicht kopiert**). `--all` öffnet den Altbestand
  bewusst. `--imported-after` bleibt als expliziter Override.
- `calculatePressScore` durch den Import aus `lib/shared/scoring.ts` ersetzen.
- `haiku-patch` samt Helfern löschen.

**Konsequenz für die Dateiendung:** `lib/shared/scoring.ts` und
`lib/shared/dashboard.ts` sind TypeScript. Ein reines `.mjs` kann sie ohne tsx
nicht importieren. Zwei Wege:

- **(bevorzugt)** `session-pipeline.mjs` → `session-pipeline.ts`, Aufruf per
  `tsx`, genau wie `apply-event-scores.ts`. Vereinheitlicht beide Skripte und
  gibt Typen. `npm`-Skript ergänzen.
- (Ausweichweg) die geteilten Funktionen in einen `.mjs`-Kernel ziehen, wie es
  `lib/shared/doi-extract.mjs` schon vormacht.

⚠️ **Falle:** `import 'server-only'` bricht den tsx-Skriptpfad. Nur aus
`lib/shared/**` importieren, niemals aus `lib/server/**`.

## AP B — Doku auf ein Dokument zusammenziehen

Nach A schrumpft der operative Teil auf wenige Zeilen, weil die Fallen weg sind.

- Neu: `docs/INCHAT_SCORING.md` für **beide** Entitäten (der Ablauf ist seit
  prod-first identisch).
- `docs/PUBLICATIONS_INCHAT_SCORING.md`: die obere Hälfte (Stand 2026-06-17,
  „lokal ist kanonisch") ist **obsolet und gefährlich** — wer oben zu lesen
  anfängt, bewertet lokal. Seit dem 2026-07-30 ist das besonders schädlich, weil
  local und prod für denselben TYPO3-Satz **verschiedene UUIDs** haben. Raus
  damit; git bewahrt sie auf.
- `docs/EVENTS_INCHAT_SCORING.md` inhaltlich übernehmen, Datei auflösen.
- Verweise nachziehen: `docs/HANDOVER.md`, `docs/BEWERTUNGS_RUBRIK.md`,
  `docs/RESUME_SCORING_SPLIT_IMPLEMENTATION.md`.

## AP C — `/bewerten` dünn machen

`.claude/commands/bewerten.md` existiert bereits, dupliziert aber die Doku.
Nach A/B auf das reduzieren, was **nicht** in Code oder Doku gehört:

- Verweis auf `docs/INCHAT_SCORING.md`.
- Rubriktreue: `lib/server/analysis/prompts.ts` bzw.
  `lib/server/events/prompts.ts`.
- Nach jedem Batch Median, Spanne und Ausreißer berichten — nicht nur „fertig".
- Kein OpenRouter (`analyze-events` ist der Fallback, nicht der Weg).

## Verifikation

Es gibt **keine Tests auf `session-pipeline.mjs`**. Deshalb:

1. `candidates` gegen **lokal** — Anzahl muss dem 60-Tage-Fenster entsprechen.
2. `candidates --all` gegen lokal — muss den Gesamtpool liefern.
3. `apply` gegen lokal **ohne** `--apply` (Vorschau), dann mit.
4. `apply --force` gegen lokal — überschreibt Bewertetes.
5. `candidates --target=prod` — muss **ohne** `export PG_DATABASE_URL` und
   **ohne** sslmode-Basteln laufen (das ist der eigentliche Beweis für A).
6. `apply --target=prod` ohne `--apply` — Vorschau, darf nichts schreiben,
   `confirmProd` muss greifen.
7. `npx tsc --noEmit`, `npx vitest run`, `npx eslint`,
   `node scripts/check-schema-drift.mjs`, `bash scripts/check-em-dashes.sh`.
8. Gegenprobe, dass nichts gebrochen ist: `scripts/push-analysis-to-prod.mjs`
   und `scripts/recovered-candidates.mjs` rufen `session-pipeline` bzw. dieselben
   Views — beide einmal im Dry-run fahren.

## Umgebung

```bash
if ! pgrep -f '5433:127.0.0.1:5432' >/dev/null; then npm run db:tunnel & sleep 3; fi
```

Prod-DB nur über den Tunnel (`PROD_DB_TUNNEL=1`), **kein**
`NODE_TLS_REJECT_UNAUTHORIZED=0`. Prod ist kanonisch; die lokale DB ist ein
Schnappschuss vom Volldump-Import am 2026-07-30.

## Fertig ist es, wenn

- `node scripts/session-pipeline.ts candidates 25 --target=prod` **ohne**
  Vorbereitungszeile läuft.
- Beide Bewertungsskripte dieselbe Härtung tragen (Tabelle oben, alle ✅).
- `calculatePressScore` nur noch **einmal** im Repo steht.
- `haiku-patch` weg ist.
- Genau **ein** Dokument den Ablauf beschreibt, ohne Warnung vor Fallen.
- `/bewerten` auf dieses Dokument zeigt, statt es zu wiederholen.

## Nicht Teil dieses Plans

- Der **Altbestand** von ~3.500 Kandidaten (überwiegend 2023). Bleibt bewusst
  liegen; laut `docs/RESUME_SCORING_SPLIT_CODEREVIEW.md` §5 wäre das ein
  CLI-Lauf über OpenRouter für 25–40 USD, keine In-Chat-Aufgabe.
- Die beiden offenen Alarm-Ursachen des Nacht-Ingests: der Events-Leerfeed wird
  fälschlich `failed` statt `skipped` (`lib/server/ingest/run-events-import.ts`,
  `classifyEmptyFeed`) und `DRIFT_ALARM_THRESHOLD = 25` ist zu eng (real bis 91
  gemessen). Eigener Arbeitsgang.

## Wie es ausgegangen ist (2026-07-30)

Umgesetzt in `25db4d5` (AP A) und dem Folge-Commit (AP B + C). Vier Punkte sind
anders gelaufen als geplant:

1. **`node scripts/session-pipeline.ts` funktioniert nicht**, entgegen dem
   Kriterium in „Fertig ist es, wenn". Node 24 strippt zwar Typen nativ, löst
   aber die tsconfig-`paths` (`@/…`) nicht auf. Kanonisch ist deshalb
   `npx tsx scripts/session-pipeline.ts …` bzw. `npm run session-pipeline -- …`.
   Sonst ist das Kriterium erfüllt: der Lauf braucht keine Vorbereitungszeile.
2. **`enrich-api` und `enrich-augment` bleiben.** Befund 4 hielt sie für tot,
   weil sie nur in `docs/HANDOVER.md` auftauchen. Sie stehen aber auch in der
   ausgelieferten Hilfe (`content/help/scores/score-fehlt.mdx`,
   `content/help/pipeline/enrichment.mdx`, `lib/client/explanations.tsx`) — ein
   Löschen hätte die App-Hilfe zur Lüge gemacht.
3. **`push-analysis-to-prod.mjs` hängt nicht an `PG_DATABASE_URL`**, es benutzt
   längst `connectDb`. Die tatsächlichen Nutzer der Variable sind
   `webdb-import.mjs`, `webdb-import-v2.ts`, `parity-gate.ts` und
   `backfill-journal.ts`. Der Override bleibt trotzdem erhalten — aber ein
   explizites `--target` schlägt ihn jetzt, damit eine in der Shell
   hängengebliebene Variable keinen Prod-Lauf still umlenkt.
4. **`confirmProd` zeigte die falsche Datenbank an.** `redactedDatabaseUrl()`
   liest `process.env.DATABASE_URL`; ohne ein vorheriges Setzen stand dort der
   Wert aus `.env.local`, also die lokale DB — die Rückfrage, die vor einem
   Prod-Write schützen soll, hätte „lokal" behauptet. Gefixt wie im
   Geschwisterskript.

Nebenbei: ein vorbestehender Em-Dash in `lib/shared/changelog.ts` brach
`npx eslint` auf `main`; Satz umformuliert. Die Doku-Verweise auf
`session-pipeline.mjs` wurden repo-weit nachgezogen, **außer** in bereits
applizierten Migrationen — dort stehen sie in Kommentaren und bleiben als
historischer Stand unangetastet.
