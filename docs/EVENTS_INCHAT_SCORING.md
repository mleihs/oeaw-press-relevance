# Resume: Upcoming-Events in-chat bewerten (NICHT über OpenRouter)

**User-Wunsch:** Claude bewertet die kommenden Veranstaltungen **direkt im Chat**
als Opus 4.8 (kein OpenRouter-Call, keine Kosten), schreibt die Scores dann via
Script in die **prod**-DB. Resume-Trigger nach `/clear`:
**„bewerte die upcoming events im chat"** → diese Datei lesen und durcharbeiten.

> Schwester-Doc: `docs/PUBLICATIONS_INCHAT_SCORING.md` (Publikationen). Der
> WebDB-Re-Import end-to-end ist `docs/WEBDB_IMPORT.md`.

## Schlüssel-Fakt 1: Events werden DIREKT AUF PROD bewertet

Anders als Publikationen (lokal kanonisch, dann gepusht) werden **Events gegen prod**
bewertet. Gründe (gelernt 2026-06-25):
- Lokale und prod-Event-Rows haben **verschiedene `id` (uuid)**. Stabiler
  Natural Key ist **`webdb_uid`** (TYPO3 news uid).
- `scripts/apply-event-scores.ts` matcht per **`id`**, also müssen die **prod**-ids
  verwendet werden.
- Daher: Kandidaten von **prod** ziehen, bewerten, auf **prod** anwenden. Das lokale
  events-Table NICHT bewerten (ids matchen nicht).

Prod ist vorwärtsgerichtet: nur **zukünftige** Events (`event_at >= now()`) werden
bewertet. Vergangene unbewertete Events bleiben liegen (keine Presserelevanz mehr).

## Schlüssel-Fakt 2: prod = ZWEI DBs (VPS kanonisch + Cloud-Warm-Standby)

Seit dem Self-Hosting-Umzug gibt es **zwei** prod-Datenbanken (verifiziert 2026-07-16):

1. **VPS `db-oeaw.metaspots.net` = die eine Live-DB (kanonisch).** App + alle Scripts
   lesen/schreiben ausschließlich hier. **Nur hierhin scoren.**
2. **Supabase-Cloud (`…duqybyxpgghietjbrxnc…`, eu-west-3) = passiver Warm-Standby.**
   Wird **einmal pro Nacht um 03:30 UTC** komplett neu überschrieben durch
   `oeaw-db-mirror.timer` → `/usr/local/sbin/mirror-oeaw-db-to-cloud.sh`
   (`pg_dump --schema=public --clean --if-exists` von der VPS, per `psql` in die Cloud,
   einseitig VPS→Cloud). Kein Live-Mit-System, kein Doppel-Write nötig.

⇒ **Scores nur auf die VPS schreiben.** Der 03:30-Mirror trägt sie automatisch in die
Cloud (ein manueller Cloud-Write würde beim nächsten Mirror eh überschrieben).

## Schlüssel-Fakt 3: VERBINDUNG geht über SSH-Tunnel (WICHTIG, aber sauber)

Von der ÖAW-Office-IP resettet die Firewall den TLS-Handshake zum öffentlichen
Pooler `db-oeaw.metaspots.net:5432` (`ECONNRESET`). Der Pooler selbst ist gesund; nur
der Netzpfad wird abgewürgt (Corporate-Firewall der ÖAW, nicht unsere Infra). Ein
SSH-Tunnel über `:22` ist der korrekte, sichere Dev→Prod-Zugang. Seit 2026-07-16 ist er
first-class integriert, **kein** manuelles URL-Basteln und **kein** prozessweites
`NODE_TLS_REJECT_UNAUTHORIZED=0` mehr:

```bash
npm run db:tunnel &        # ssh -N -L 5433:127.0.0.1:5432 metaspots (Hintergrund)
# danach jedem prod-Befehl PROD_DB_TUNNEL=1 voranstellen:
PROD_DB_TUNNEL=1 node scripts/event-candidates.mjs --target=prod
```

Wie das sauber funktioniert (`scripts/lib/db.mjs`):
- `PROD_DB_TUNNEL=1` → `loadDbUrl('prod')` schreibt Host:Port der Pooler-URL auf
  `127.0.0.1:5433` um und normalisiert auf `sslmode=require`. Gilt für **alle**
  prod-Scripts (`event-candidates`, `sync-events`, `apply-event-scores`, …).
- **postgres-js (Drizzle, `lib/server/db`)** toleriert das self-signed Cert des Poolers
  unter `sslmode=require` (genau wie die Live-App) — kein Flag nötig.
- **node-pg (`connectDb`)** bekommt ein **verbindungsgebundenes**
  `ssl:{rejectUnauthorized:false}` (nicht prozessweit!), und `sslmode` wird aus der URL
  gestrippt, damit dieses ssl-Objekt greift. Jede andere TLS im Prozess (Sentry,
  OpenRouter) bleibt voll verifiziert.
- `PROD_DB_URL_OVERRIDE` existiert weiter als Escape-Hatch (fertige URL gewinnt).
- Für reines `psql` (libpq kennt `no-verify`/`require`-self-signed): URL
  `…@127.0.0.1:5433/postgres?sslmode=require` verwenden.
- Env verschwindet pro Shell-Aufruf → Tunnel-Check + `PROD_DB_TUNNEL=1` je Bash-Block
  (Snippet unten in Schritt 0).

> **Offen (tiefere Infra-Wurzel, separat):** Der Pooler ist öffentlich auf
> `0.0.0.0:5432/6543` exponiert und präsentiert ein self-signed Cert; VPS-App **und**
> Vercel hängen am öffentlichen `db-oeaw.metaspots.net:5432`. Echter Wurzel-Fix = echtes
> LE-Cert via Traefik-TLS-Termination + Port entöffentlichen/IP-allowlisten + Clients auf
> `verify-full` repointen. Berührt den Live-Proxy (coolify-proxy) + Vercel + Coolify-
> Persistenz → als eigener, abgesicherter Schritt geplant, nicht mitten im Scoring.

## Neu UND aktualisiert: `sync-events` erfasst beides automatisch

`sync-events` liest **TYPO3-MySQL** (Source of Truth, Container `oeaw-webdb-mysql`),
nicht das lokale Postgres, und upsertet direkt in prod. Der UPSERT in
`lib/server/events/sync.ts::upsertEvents` (Re-Score-Logik):
- **Neue** Events → INSERT mit `event_score = NULL` ⇒ Kandidat.
- **Aktualisierte** Events → wenn scoring-relevanter Inhalt (title/teaser/bodytext/
  event_information/event_at) eines **zukünftigen** Events sich ändert (`IS DISTINCT
  FROM`), werden `analysis_status→'pending'` und alle Score-/Text-Spalten auf `NULL`
  zurückgesetzt ⇒ Event fällt zurück in den Kandidaten-Pool und wird neu bewertet.
- Idempotenter Re-Sync (identischer Inhalt) = No-op, Scores überleben.
- Vergangene Events (`event_at < NOW()`) verlieren ihren Score NIE.

⇒ Nach einem neuen WebDB-Import genügt **ein**
`PROD_DB_TUNNEL=1 npm run sync-events -- --target=prod --yes` (MySQL-Container
`oeaw-webdb-mysql` muss laufen); danach listet `event-candidates` automatisch neu +
materiell geändert (beide `event_score IS NULL`).

## Stand (2026-07-16)

Frischer WebDB-Re-Import (lokal kanonisch). `sync-events --target=prod` gelaufen
(durch Tunnel): **imported 9, updated 157, pruned 0** (166 aus TYPO3). Danach auf prod:
**18 future-unscored Kandidaten** (9 brandneu + 9 materiell geänderte), 166 future-total.
⇒ 1–2 Batches. Verbindungsweg (Tunnel + Override + TLS-Flag) verifiziert.

Vorheriger Stand (2026-06-25): 29 Zukunfts-Events als Opus 4.8 bewertet, prod 162→191;
Kalibrierung hielt (Mittel ~0.25, Top Schrödinger-Centenary 0.666).

## Schritt 0 — Session-Setup (Verbindung herstellen)

Tunnel einmal je Session starten, dann jedem prod-Befehl `PROD_DB_TUNNEL=1` voranstellen.
Tunnel-Check-Snippet für jeden Bash-Block:
```bash
if ! pgrep -f '5433:127.0.0.1:5432' >/dev/null; then npm run db:tunnel & sleep 3; fi
# danach z.B.: PROD_DB_TUNNEL=1 node scripts/event-candidates.mjs --target=prod
```

## Schritt 1 — unbewertete Events holen

```bash
PROD_DB_TUNNEL=1 node scripts/event-candidates.mjs --target=prod            # alle offenen
PROD_DB_TUNNEL=1 node scripts/event-candidates.mjs --target=prod --limit=15 # Batch
```

Gibt JSON `{count, rubric_dims, events:[{id, webdb_uid, title, teaser, bodytext,
event_information, event_at, location_title, organizer_title, institute, url, lang,
content, content_chars}]}`. `content` ist HTML-bereinigt — direkt daraus bewerten.
`count: 0` ⇒ nichts mehr offen. Bei neuem Import erst `sync-events --target=prod`.

## Schritt 2 — bewerten (Rubrik, identisch zu lib/server/events/prompts.ts)

Pro Event 4 Dimensionen (0.0–1.0). **KEIN Haiku** (anders als bei Pubs):
- **public_appeal** — Eignung für breites, fachfremdes Publikum. Hoch: öffentl.
  Vorträge, Ausstellungen, Lesungen, Podien, Aktionstage. Niedrig: interne
  Seminare, Workshops, Arbeitstreffen, Gremien.
- **scientific_significance** — Bedeutung Thema/Vortragende, Flaggschiff-Charakter,
  gesellschaftliche Tragweite.
- **reach** — Breite der Zielgruppe (überregional/allgemein vs. Nische).
- **timeliness** — aktueller Anlass: Diskurs, Jahrestag, Saison, Ereignis.

Gewichte (macht `computeEventScore`, du lieferst nur die 4 Dims): **public_appeal .32 ·
scientific_significance .32 · reach .21 · timeliness .15**.

> Diese Zeile nannte bis 2026-07-21 die alten Werte .35/.30/.20/.15. Die Gewichte
> sind seit [[events-score-weights-feature]] **in der DB konfigurierbar** und wurden
> mit der Rubrik v2 (2026-07-01) auf .32/.32/.21/.15 geändert; `computeEventScore`
> liest sie von dort. Am 2026-07-21 nachgerechnet: dieselben Dims ergeben nach Doku
> 0.7375, geschrieben wurde 0.7385 = die DB-Gewichte. Die Doku war also stale.
> **Konsequenz fürs Bewerten: keine.** Du lieferst nur die vier Dims, das Script
> rechnet. Relevant nur, wenn du einen Score von Hand gegenrechnest.

Plus Freitext (Deutsch, echte Umlaute ä/ö/ü/ß — niemals ae/oe/ue/ss; KEINE
Gedankenstriche „—"; KEINE Anführungszeichen, die brechen das JSON):
- **pitch_suggestion** — 2-4 Sätze Teaser für die Veranstaltungsseite.
- **suggested_angle** — 1 Satz Aufhänger.
- **target_audience** — 1-3 Angaben (z.B. breite Öffentlichkeit, Fachpublikum).
- **reasoning** — 2-3 Sätze Begründung, rein inhaltlich, kein Feld-/Variablenname.

### Kalibrierung (aus den prod-gescorten Events)
Mittel ~0.23, Spanne 0.0–0.87. Anker:
- **0.0–0.10**: interne/technische Seminare, Workshops, Group Meetings.
- **0.20–0.40**: spezialisierte öffentliche Vorträge/Kolloquien, enges Thema.
- **0.55–0.75**: öffentliche Vorträge mit breiter/aktueller Resonanz.
- **0.80–0.90**: Flaggschiff-Events zu gesellschaftlichen Hot-Topics (KI,
  Geopolitik, Klima, prominente Gastvorträge).
Viele Kandidaten sind Seminare/Fachvorträge → erwarte linksschiefe Verteilung mit
mehreren Near-Zero-Items. Ehrlich aus dem Content bewerten.

## Schritt 3 — schreiben

JSON-**Array** (flach, kein `{evaluations:…}`-Wrapper) in eine Temp-Datei, keyed
per **prod-`id`** aus dem Puller:
```json
[{ "id":"<prod-uuid>","public_appeal":0.0,"scientific_significance":0.0,"reach":0.0,
   "timeliness":0.0,"pitch_suggestion":"…","suggested_angle":"…",
   "target_audience":"…","reasoning":"…" }]
```
Dann anwenden (Verbindung aus Schritt 0 muss aktiv sein; reuse computeEventScore,
Provenienz aus `lib/shared/event-session-model.json`, cost 0). Das Script ist
seit 2026-07-21 **Dry-run by default** und validiert hart: eine fehlende oder
nicht-numerische Dimension bricht mit Item-Liste ab, statt sie still auf 0 zu
setzen. `--apply` schreibt, `--yes` bestätigt den prod-Write, `--force`
überschreibt bereits bewertete Events (ohne `--force` schützt
`event_score IS NULL` im UPDATE, ein zweiter Lauf ist also idempotent):
```bash
# 1. Trockenlauf: Validierung + Vorschau, schreibt nichts
PROD_DB_TUNNEL=1 npm run apply-event-scores -- --target=prod --file=/tmp/events-batch-N.json
# 2. Schreiben
PROD_DB_TUNNEL=1 npm run apply-event-scores -- --target=prod --yes --apply --file=/tmp/events-batch-N.json
```
Nach jedem Batch verifizieren (Tunnel aktiv; psql braucht `sslmode=require`):
```bash
PSQL=$(ls /opt/homebrew/Cellar/libpq/*/bin/psql | head -1)
PW=$(grep '^PROD_DB_URL_POOLER=' ~/.config/oeaw-press-release/prod-credentials | cut -d= -f2- | sed -E 's#.*//postgres.dev_tenant:([^@]+)@.*#\1#')
"$PSQL" "postgresql://postgres.dev_tenant:${PW}@127.0.0.1:5433/postgres?sslmode=require" -tAc \
  "select count(*) filter (where event_score is null and event_at>=now()) from events;"
```
Wiederholen bis 0. Fertig, wenn alle Zukunfts-Events gescort.

## Nicht vergessen
- KEIN OpenRouter-Lauf für Events (kein `npm run analyze-events`).
- Modell-Tag kommt aus `lib/shared/event-session-model.json` (analog
  `session-model.json` auf der Publikations-Seite). NICHT im Script
  hartkodieren: genau daher stehen auf Prod drei Tag-Varianten nebeneinander
  (`opus-4.8 (in-chat rubric v2)`, `anthropic/claude-opus-4.8 (in-chat)`,
  `anthropic/claude-opus-4 (in-chat)`), was jede Auswertung nach Modell
  verfälscht. Neues Modell = JSON anpassen, nicht das Script.
- Das Feature ist deployt (Vercel + VPS); Scores erscheinen live, sobald geschrieben.
- Der Cloud-Standby braucht KEINEN manuellen Write (nächtlicher 03:30-Mirror).
</content>
