# Nacht-Betrieb — Bestandsaufnahme für den Code-Review (ultra)

Stand 2026-08-31. Ergebnis eines manuellen Durchgangs durch alles, was nachts
läuft: Skripte, Trigger, Härtung, Alarm-Ketten und die Bewertungs-Anbindung.
Fünf Dinge wurden dabei direkt gefixt (§3), der Rest steht als priorisierte
Befundliste (§4) — als Aufsetzpunkt für einen `/code-review ultra`, damit der
nicht Bekanntes wiederentdeckt, sondern an den markierten Stellen tiefer gräbt.

Fachliches Runbook: `docs/NIGHTLY_OPS.md` · Quellen-Analyse: `docs/WEBDB_PERSON_GAP.md`
· Ops-Dateien der Box: `infra/metaspots/` (Abgleich `sync-check.sh`).

## 1. Scope-Karte — was nachts läuft

Alle Zeiten Europe/Vienna, außer UTC vermerkt. Timer auf dem VPS metaspots.

| Zeit | Unit/Timer | Skript (Repo-Kopie) | Zweck |
|---|---|---|---|
| 02:35 UTC | `oeaw-db-backup` | `infra/metaspots/sbin/backup-oeaw-db.sh` | pg_dump → gzip, 14 d Retention, Size+Integrity-Guard |
| 03:10 UTC | `offbox-sync-backups` (metaspots-infra, nicht hier) | – | Dumps → OneDrive |
| 03:30 UTC | `oeaw-db-mirror` | `infra/metaspots/sbin/mirror-oeaw-db-to-cloud.sh` | Warm-Standby in die Supabase-Cloud, Row-Count-Parity als Erfolgssignal |
| 06:15 | `oeaw-export-archive` | `infra/metaspots/sbin/archive-oeaw-exports.sh` | Rohexporte gzip-archivieren, BEVOR der Ingest sie anwendet (90 d) |
| 06:30 | `oeaw-press-ingest` | `infra/metaspots/bin/oeaw-press-ingest.sh` | `POST /api/ingest/run` + komplette Alarm-Kette (Sentry-Cron-Check-in, Sentry-Event, Mail websites@) |
| 07:00 | `oeaw-press-embeddings` | `infra/metaspots/bin/oeaw-press-embeddings.sh` | SPECTER2 → `press_similarity` |

App-Seite (`POST /api/ingest/run`, `app/api/ingest/run/route.ts`), sequenziell,
je Feed eigenes try/catch, immer HTTP 200:

1. **Publications-Delta** — `lib/server/ingest/run-publications-delta.ts` →
   Adapter `adapters/typo3-publications-delta.ts` (pur, Zod-Hülle) → DB-Funktion
   `apply_publications_delta` (Live-Definition: Migration `20260826000001`,
   atomar, schreibt selbst `ingest_runs`-Journal + Cursor) → Matview-Refresh
   nach Commit.
2. **Events** — `lib/server/ingest/run-events-import.ts` → Adapter
   `adapters/typo3-events-json.ts` → `upsertEvents` (`lib/server/events/sync.ts`)
   + Journal in EINER Transaktion; Leerfeed-Klassifikation `classifyEmptyFeed`.
3. **Enrichment** — `lib/server/ingest/run-enrichment.ts` →
   `lib/server/enrichment/batch.ts` (Kaskade CrossRef→OpenAlex→Unpaywall→
   S2→PDF, je Call `AbortSignal.timeout(10–15 s)`, Deckel `INGEST_ENRICH_LIMIT`,
   Default 200).

Severity: `classifyRun` (`lib/server/ingest/classify-run.ts`) → `ok` /
`degraded` / Alarm; der VPS-Wrapper übersetzt das in Check-in, Sentry-Event
(stabiler Fingerprint) und Mail.

**Bewertungs-Anbindung:** Der Nacht-Lauf bewertet NICHTS. Neue Zeilen landen als
Kandidaten (`analysis_status='pending'` / `event_score IS NULL`) in den
kanonischen Views (`publication_scoring_candidates` / `event_scoring_candidates`,
Migration `20260716000001`); bewertet wird In-Chat (`/bewerten`) oder per
„Bewerten"-Button (OpenRouter-Fallback). Einzige Nacht-Berührung mit Scores:
`upsertEvents` setzt die Analyse-Spalten eines KÜNFTIGEN Events zurück, wenn
sich bewertungsrelevanter Inhalt ändert (Re-Score-Trigger, IS DISTINCT FROM).

## 2. Härtung — was bereits steht (nicht erneut melden)

- **Idempotenz beidseitig**: `(feed, generated_at_timestamp)` UNIQUE; Pubs
  zusätzlich `pg_advisory_xact_lock` je Feed (Single-Flight).
- **Fail-closed Volldump-Guard**: > 2000 Pubs / > 20000 Personen ⇒ Exception
  statt Anwendung (griff korrekt am 22.08.); Replay aus dem Rohexport-Archiv
  mit `--force` + `--dry-run` (wendet an, rollt zurück).
- **Key-Presence-Semantik für Personen** (seit 29.07.): fehlender Schlüssel =
  Bestand behalten (`jsonb_populate_record`), gelieferter Leerwert = löschen.
- **Alarm-Kette gegen ihre eigenen Ausfälle gehärtet** (22.08.-Post-mortem):
  `describeError` (tiefste cause gewinnt, 600-Zeichen-Deckel statt 15-MB-Drizzle-
  Payload), Wrapper-Body nur als Datei/`--rawfile` (nie argv), 20-KB-Deckel für
  alles, was die Box verlässt, missglückter Envelope-Bau meldet sich.
- **Origin-Pin ohne TLS-Aufweichung**: `OEAW_EXPORT_ORIGIN_IP` via undici-Agent
  bzw. `curl --resolve` — SNI/Host bleiben `www.oeaw.ac.at`, kein `-k` (außer
  dem dokumentierten localhost-Hop des Wrappers).
- **Cron-Auth**: Bearer, SHA-256 + `timingSafeEqual`, 503 bei unset, Limiter
  (seit heute NACH der Secret-Prüfung, §3.2).
- **Leerfeed-Klassifikation** (26.08.): Serie + Stale-Zeitstempel statt
  Einzelnacht; Fehlalarmquote von 34 % auf ~0 gebracht.
- **Beleg-Sicherung**: Rohexport-Archiv VOR dem Anwenden, eigener Timer,
  JSON-/gzip-Integritäts-Checks, frisch aufgelöste Origin-IP.
- Testlage: 115 Tests in `lib/server/ingest/**` (Adapter, Klassifikation, Auth,
  describeError, Drift-Aufbereitung).

## 3. Am 2026-08-31 gefixt

1. **Drift-Metrik: Personen-Waisen raus aus dem Alarm** (`countDrift` in
   `run-publications-delta.ts`, `drift.ts`, Blasen-Text). Begründung und Zahlen:
   `WEBDB_PERSON_GAP.md` §8 — 43,5 % der Autorenverknüpfungen zeigen schon in
   der Quelle ins Leere; die Metrik skalierte mit der Nachtgröße (08.08.: 80
   Fälle ⇒ Fehlalarm). Personen-Waisen bleiben Warnung/`degraded`/Journal/Blase.
   Damit ist der letzte bekannte Fehlalarm-Kanal des Nacht-Ingest zu.
2. **Cron-Auth-Reorder** (`cron-auth.ts`): Secret-Prüfung VOR dem Rate-Limiter.
   Vorher konnte ein Außenstehender mit 5 Fehlversuchen unter gefälschtem
   `X-Forwarded-For` (erster Eintrag ist client-kontrolliert) die IP des
   Nacht-Crons sperren ⇒ 429 trotz korrektem Secret ⇒ ausgefallener Import +
   Fehlalarm. Jetzt gewinnt das korrekte Secret immer; der Limiter bremst nur
   Fehlversuche. Regressionstest benennt das Szenario.
3. **`oeaw-export-archive.timer`: `Persistent=true`** — war als einziger Timer
   ohne Catch-up; nach Downtime um 06:15 hätte der (persistente) Ingest ein
   UNarchiviertes Delta angewandt — Beleg weg, genau der Fall, für den das
   Archiv existiert.
4. **`oeaw-press-embeddings.sh`: `logger` → stdout + `SyslogIdentifier` in der
   Unit** — dieselbe Defektklasse, die beim Ingest-Wrapper im 07-21-Post-mortem
   gefixt wurde: `logger`-Zeilen erscheinen nicht unter `journalctl -u`, der
   OK/FAILED-Ausgang des Laufs war in der Unit-Historie unsichtbar.
5. **`NIGHTLY_OPS.md` entstaubt**: Zeiten (06:15/06:30/07:00 statt 06:00/06:30),
   Response-Shape (`degraded`/`summary`), doppelte „5." im Runbook, Hinweis
   „Wrapper nicht versioniert" (ist er seit 26.08.), AP3 als erledigt.
6. **Timeout für den Export-Fetch** (`fetch-export.ts`): `fetchJsonExport` war
   der einzige externe Call der Nacht OHNE Obergrenze (Enrichment 10–15 s,
   Archiv 300 s, Wrapper-curl 2700 s) — ein hängender Origin hätte die Route
   bis zum Plattform-Timeout blockiert. Jetzt `AbortSignal.timeout(300 s)`.

Fixes 3+4 sind Repo-Kopien — **auf der Box erst wirksam nach dem manuellen
Rollout** nach `infra/metaspots/README.md` (scp + `systemctl daemon-reload`);
bis dahin meldet `sync-check.sh` erwartete Drift.

## 4. Offene Befunde für den Ultra-Review (priorisiert)

**B1 — `getClientIp` vertraut dem ersten `X-Forwarded-For`-Eintrag**
(`lib/server/rate-limit.ts`). Der erste Eintrag ist client-kontrolliert
(Proxies hängen nur an): die IP-Limiter von `/api/auth/login` und
`/api/auth/gate` sind damit (a) per XFF-Rotation umgehbar und (b) als Sperre
gegen fremde IPs missbrauchbar. Für den Cron seit heute entschärft (§3.2);
für Login/Gate offen. Vorschlag: rechtesten nicht-vertrauenswürdigen Hop
nehmen (bekannte Proxy-Kette Cloudflare→Traefik) oder `CF-Connecting-IP`
bevorzugen, wenn der Request nachweislich über CF kam.

**B2 — Cross-Source-Clobber im Events-Upsert** (`lib/server/events/sync.ts`).
`upsertEvents` wird vom dünnen JSON-Feed (kein `bodytext`/`url`/`lang`) UND vom
MySQL-Sync (voll) gefüttert und überschreibt alle Inhaltsspalten mit
`EXCLUDED.*`. Liefert der JSON-Feed eine uid, die zuvor per MySQL kam, werden
`bodytext`/`url`/`lang` genullt — und weil `bodytext IS DISTINCT FROM NULL` den
Re-Score-Trigger zündet, verliert ein künftiges Event dabei auch seine
Bewertung. Real selten (der JSON-Feed wiederholt uids laut 28-Tage-Beleg nie),
aber ein `updated`-Zähler existiert, der Fall ist also vorgesehen. Prüfen:
COALESCE für Felder, die die jeweilige Quelle nicht führt, oder Quellen-Tag je
Zeile.

**B3 — Publications-Upsert ohne Key-Presence-Semantik**
(`apply_publications_delta` (e), Adapter `normalizePublication`). Der
Personen-Vorfall vom 22./29.07. (Quelle dampft Sätze ein, Upsert nullt Bestand)
ist NUR für Personen gefixt. Dampft der Export je Publikationssätze ein,
nullt der Upsert `summary_de/en`, Zitierformate etc. genauso lautlos — und
`summary_*` ist Content-Gate des Scorings. Der 28-Tage-Beleg zeigt Pub-Sätze
bisher immer voll (31 Felder); das ist eine Upstream-Annahme ohne Guard.
Vorschlag: gleiche `jsonb_populate_record`-Mechanik für Publikationen, oder
mindestens ein Zähler „Pub-Satz mit < N Schlüsseln" als failed-Signal.

**B4 — `maxDuration = 300` in der Ingest-Route** vs. reale Laufzeit (Enrichment
~5 min+, Wrapper-curl erlaubt 2700 s). Auf metaspots (Node-Server) wirkungslos,
aber auf dem Vercel-Hot-Standby würde derselbe Cron nach 300 s gekappt — ein
Failover wäre also KEIN funktionierender Nacht-Ingest. Bewusst dokumentieren
oder Enrichment beim Standby-Betrieb abtrennen.

**B5 — Backup/Mirror/Archiv alarmieren nicht aktiv.** `oeaw-db-backup`,
`oeaw-db-mirror`, `oeaw-export-archive` melden Fehler nur als failed-Unit im
Journal (kein Sentry, keine Mail; Kuma optional). Ein seit Wochen scheiterndes
Backup fiele erst beim Restore auf. Der Mirror prüft zudem Parity nur auf 7
hartkodierten Tabellen — neue Tabellen (z. B. `card_references`, spätere
Features) fehlen im Erfolgssignal still (`ON_ERROR_STOP=0` schluckt die
Restore-Fehler). Vorschlag: mindestens `OnFailure=`-Hook mit Mail, Parity-Liste
aus `information_schema` generieren.

**B6 — Wrapper-Nits** (`oeaw-press-ingest.sh`): (a) `BODY_FILE=$(mktemp)` liegt
VOR dem `trap`-Setup — bei SIGTERM während des langen curl (Timeout-Kill der
Unit) bleiben Tempfiles liegen (kosmetisch, /tmp wird geräumt); (b) `mail_team`
liest `$MAIL_FROM/$MAIL_TO` unter `set -u` — ist `SMTP_URL` gesetzt, die
Mail-Vars aber nicht, stirbt das Skript mitten im Alarmpfad; (c) `checkin`/
`sentry_event` teilen den curl-Envelope-Aufruf nicht (Duplikation). Alles
Rollout-pflichtig auf der Box, daher gesammelt angehen.

**B7 — Kommentar vs. Mechanik bei „delete wins"** (`apply_publications_delta`,
Abschnitt DELETES). Der SQL-Kommentar begründet die Reihenfolge mit
„delete-wins", tatsächlich stellt der ADAPTER delete-wins her (uid wird aus dem
Upsert-Set entfernt); in SQL gewinnen Junction-DELETES durch Reihenfolge (h nach
f/g), Entitäts-Upserts kämen NACH den Deletes wieder rein, wenn der Adapter das
nicht verhinderte. Funktional heute korrekt, aber die Invariante lebt verteilt
über zwei Schichten ohne Test, der sie festnagelt.

**B8 — `countEmptyStreak` liest maximal `EMPTY_FEED_ALARM_STREAK` Zeilen**
(`run-events-import.ts`): `report.empty_streak` sättigt bei 6 — nach 20
Leernächten stünde immer noch „6". Fürs Verdikt egal (>= 5 bleibt >= 5), fürs
Journal irreführend. Kosmetik.

**B9 — Destruktiver Prune im MySQL-Events-Pfad** (`syncUpcomingEvents`):
löscht künftige Events, die die MySQL-Quelle nicht liefert — hätte beim
Vollabzug am 19.08. 12 künftige Events (5 bewertet) entfernt. NICHT im
Nachtpfad (der JSON-Runner pruned nie), aber eine Runbook-Falle: `sync-events
--target=prod` bleibt gefährlich, solange beide Quellen parallel existieren.
Vorschlag: Prune hinter ein explizites Flag legen.

**B10 — Ungetestete Schicht**: die vier Shell-Skripte und die DB-Funktion
selbst haben keine automatisierten Tests (die Funktion ist nur via
`--dry-run`-Pfad manuell prüfbar). Für die Funktion wäre ein pgTAP- oder
Fixture-basierter Test des Guards/der Key-Presence-Semantik der größte Hebel.

## 5. Startpunkte für den Review

- Einstieg App: `app/api/ingest/run/route.ts` → die drei Runner → Adapter.
- Einstieg DB: `supabase/migrations/20260826000001_ingest_drift_details.sql`
  (= Live-Definition von `apply_publications_delta`).
- Einstieg Box: `infra/metaspots/bin/oeaw-press-ingest.sh` (Alarm-Kette),
  Units in `infra/metaspots/systemd/`.
- Historie der Vorfälle, gegen die alles gehärtet ist: 2026-07-20/21
  (Fehlalarm-Serie), 2026-07-22/29 (Personen-Clobber), 2026-08-22 (Volldump +
  stumme Alarm-Kette), 2026-08-26 (Leerfeed-Fehlalarme) — jeweils in den
  Kopfkommentaren der betroffenen Dateien dokumentiert.
