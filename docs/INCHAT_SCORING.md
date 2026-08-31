# In-Chat-Bewertung: Publikationen und Veranstaltungen

Claude bewertet frische Publikationen und kommende Veranstaltungen **direkt im
Chat** und schreibt die Ergebnisse per Skript auf Prod. Kein OpenRouter-Call,
keine Kosten, und die Kalibrierung bleibt konsistent mit dem Bestand.

Einstieg: `/bewerten [pubs|events|beides] [Batchgröße]`.

Der Ablauf ist für beide Entitäten derselbe: Kandidaten aus der kanonischen View
ziehen, gegen die Rubrik bewerten, als JSON ablegen, im Trockenlauf prüfen,
schreiben. Unterschiedlich sind nur Rubrik, Dimensionen und Skriptname.

## Grundsätze

- **Prod ist kanonisch.** Der Nacht-Ingest (06:00) importiert seit 2026-07-16
  direkt auf Prod; die lokale DB ist nur ein Schnappschuss vom letzten manuellen
  Import. Lokal bewerten und hochschieben geht nicht mehr: local und prod haben
  für denselben TYPO3-Satz **verschiedene UUIDs**, und die Schreibskripte matchen
  über `id`.
- **Prod = zwei DBs.** Kanonisch ist der VPS `db-oeaw.metaspots.net`; die
  Supabase-Cloud ist ein passiver Warm-Standby, der um 03:30 UTC komplett neu
  gespiegelt wird. **Nur auf den VPS schreiben** — ein Cloud-Write wäre beim
  nächsten Mirror weg.
- **Rubriktreue.** `lib/server/analysis/prompts.ts` (Publikationen),
  `lib/server/events/prompts.ts` (Events). Exakt daran halten, sonst sind die
  neuen Bewertungen mit dem Bestand nicht mehr vergleichbar.
- **Jedes Schreibskript ist Dry-run per Default.** Erst ohne `--apply` fahren,
  die Vorschau lesen, dann schreiben. Unter Prod liegt kein Netz.
- **Kein OpenRouter.** Weder der „Bewerten"-Knopf in der App noch
  `npm run analyze-events` gehören zu diesem Weg; beides ist der Fallback.

## Schritt 0 — Tunnel

Von der ÖAW-Office-IP resettet die Firewall den TLS-Handshake zum öffentlichen
Pooler. Der SSH-Tunnel ist der reguläre Dev→Prod-Zugang:

```bash
if ! pgrep -f '5433:127.0.0.1:5432' >/dev/null; then npm run db:tunnel & sleep 3; fi
```

Danach jedem Prod-Befehl `PROD_DB_TUNNEL=1` voranstellen. **Kein**
`NODE_TLS_REJECT_UNAUTHORIZED=0` und **kein** manuelles URL-Basteln:
`scripts/lib/db.mjs` schreibt Host und Port auf den Tunnel um und gibt der
node-pg-Verbindung ein verbindungsgebundenes `rejectUnauthorized:false`. Jede
andere TLS im Prozess (Sentry, OpenRouter) bleibt voll verifiziert.

## Schritt 0.5 — Anreichern (Vorstufe, gehört dazu)

Bewertbar ist eine Publikation erst, wenn sie angereichert ist: die
Kandidaten-View verlangt `enrichment_status IN ('enriched','partial','failed')`
plus 120 Zeichen Inhalt. Ohne diesen Schritt ist der Pool künstlich leer.

**Auf Prod läuft Anreicherung ausschließlich über die Ingest-Route.**
`npm run enrich-all` liest `DATABASE_URL` direkt aus `.env.local` und kennt kein
`--target`; es trifft also die lokale DB, niemals Prod. Der Nacht-Ingest (06:30
Wien) erledigt es automatisch. Wer nicht bis zur nächsten Nacht warten will,
stößt denselben Lauf von Hand an:

```bash
ssh metaspots 'systemctl start oeaw-press-ingest.service; sleep 5; \
  journalctl -u oeaw-press-ingest.service --since "-3 min" --no-pager | tail -5'
```

Das ist idempotent: beide Feeds sind über `(feed, generated_at_timestamp)`
gesichert, ein zweiter Lauf am selben Tag endet in `skipped`. Danach ist der
Kandidatenpool aktuell.

**Rückstau prüfen, bevor man sich wundert:**

```sql
SELECT count(*) FROM publications
WHERE archived = false AND enrichment_status = 'pending'
  AND doi IS NOT NULL AND doi <> '';
```

Steht da 0, ist nichts offen. Ein hoher `pending`-Gesamtwert ist **kein**
Rückstau: die Anreicherung nimmt per `include_no_doi: false` nur Publikationen
mit DOI. Korpusweit bleiben dadurch rund 17.700 Sätze dauerhaft `pending`, von
denen aber nur etwa 13 überhaupt genug Text für eine Bewertung hätten.

## Publikationen

### Kandidaten holen

```bash
PROD_DB_TUNNEL=1 npx tsx scripts/session-pipeline.ts candidates 25 --target=prod
```

Das Default-Fenster sind die letzten **60 Tage** nach `created_at`
(`SCORING_RECENT_DAYS` in `lib/shared/dashboard.ts`) — dieselbe Menge, die der
„Bewerten"-Knopf im Web erfasst. `--imported-after DATE` setzt ein eigenes
Datum, `--all` öffnet bewusst den Altbestand (siehe „Nicht Teil davon").

Die Ausgabe ist JSON; jede Publikation trägt ihren `content`, es braucht also
keine weitere DB-Abfrage. `count: 0` heißt: nichts offen. Limit maximal 200; mit
25 bleibt der Context handlich. Bewertete Zeilen fallen aus dem Pool, der Lauf
ist also jederzeit resumierbar — `analysis_status` ist das Fortschritts-Ledger.

### Bewerten

Fünf Dimensionen 0.0–1.0. Die Gewichte stehen in
`lib/shared/score-weights.json`, `press_score` rechnet das Skript (nicht selbst
setzen):

| Dimension | Gewicht |
|---|---|
| `novelty_factor` | .40 |
| `storytelling_potential` | .30 |
| `public_accessibility` | .15 |
| `media_timeliness` | .10 |
| `societal_relevance` | .05 |

Dazu Freitext auf Deutsch:

- **pitch_suggestion** — 4–6 Sätze.
- **target_audience** — kurze Angabe(n).
- **suggested_angle** — 1 Satz Aufhänger.
- **reasoning** — 2–3 Sätze, **nur aus dem Inhalt**. Nie `peer_reviewed`,
  `popular_science` oder `mahighlight` benennen; `apply` bricht darauf mit
  Exit 1 ab.
- **haiku** — optional, Deutsch 5-7-5, Trenner `" / "`.

**Kalibrierung:** typische Fachpublikationen 0.28–0.43, nischig-technisch
0.15–0.25, echt pressewürdig 0.5–0.7. Ein dichter Fachblock (GMI-Pflanzenbiologie,
Chromatin, Methodenpapiere) landet erwartungsgemäß bei 0.15–0.31; das ist kein
Zeichen für zu strenge Bewertung.

**Formatregeln**, sonst kostet es eine Korrekturrunde:

- Echte Umlaute ä/ö/ü/ß tippen, nie `ae/oe/ue/ss` als Ersatz. Aber nur Umlaute
  ersetzen: „dass/muss/Fluss/lässt" bleiben mit ss, ß nur nach langem Vokal oder
  Diphthong (Maß, weiß, groß, schließt). Das prüft kein Skript.
- Keine Anführungszeichen in den Textfeldern, die brechen das JSON.
- Keine Gedankenstriche. `apply` wandelt sie zwar in Kommata, besser gleich
  Komma oder Doppelpunkt schreiben.

### Schreiben

```json
{"evaluations":[
  {"id":"…","novelty_factor":0.0,"storytelling_potential":0.0,
   "public_accessibility":0.0,"media_timeliness":0.0,"societal_relevance":0.0,
   "pitch_suggestion":"…","target_audience":"…","suggested_angle":"…",
   "reasoning":"…","haiku":"… / … / …"}
]}
```

```bash
# 1. Trockenlauf: Validierung + Vorschau, schreibt nichts
PROD_DB_TUNNEL=1 npx tsx scripts/session-pipeline.ts apply /tmp/pubs-batch-N.json --target=prod
# 2. Schreiben (fragt vor dem Prod-Write nach; --yes überspringt die Rückfrage)
PROD_DB_TUNNEL=1 npx tsx scripts/session-pipeline.ts apply /tmp/pubs-batch-N.json --target=prod --apply
```

Der Modell-Tag kommt aus `lib/shared/session-model.json`, Kosten 0. Ohne
`--force` schützt `press_score IS NULL` im UPDATE; ein zweiter Lauf ist also
idempotent. Publikationen mit weniger als 120 Zeichen Inhalt bricht `apply`
ab — eine Bewertung ohne Substanz wäre Fabrikation.

## Pitch nachziehen, ohne neu zu bewerten

Für den Fall, dass die Scores stimmen, die Pitch-Texte aber hinter der Rubrik
zurückbleiben. Anlass war der Befund vom 2026-08-28: die Kohorte
`opus-4.8-session` benennt in **0 %** der Fälle Institut, Journal oder
Forschende, gegen 28 / 4 / 4 % in der älteren Kohorte. Ein voller Neulauf würde
die Bewertungen anfassen und die Kalibrierung ohne Not bewegen.

```bash
# 1. Kandidaten einer Bewertungs-Kohorte ziehen (gleiche Nutzlast wie candidates,
#    dazu current_pitch und press_score)
PROD_DB_TUNNEL=1 npx tsx scripts/session-pipeline.ts repitch-candidates 25 \
  --target=prod --model=anthropic/claude-opus-4.8-session > /tmp/repitch-N.json

# 2. Pitches neu schreiben, Ergebnis als [{id, pitch_suggestion}] ablegen

# 3. Trockenlauf: zeigt alt gegen neu, schreibt nichts
PROD_DB_TUNNEL=1 npx tsx scripts/session-pipeline.ts repitch-apply /tmp/neu-N.json --target=prod

# 4. Schreiben
PROD_DB_TUNNEL=1 npx tsx scripts/session-pipeline.ts repitch-apply /tmp/neu-N.json --target=prod --yes --apply
```

**Was `repitch-apply` anfasst:** ausschließlich `pitch_suggestion` und
`updated_at`. Nicht `press_score`, keine der fünf Dimensionen, nicht
`analysis_status`, nicht `llm_model` und nicht `reasoning`. Letzteres bewusst:
das Reasoning begründet den Score und darf sich nicht unabhängig von ihm
bewegen. `target_audience` und `suggested_angle` bleiben ebenfalls stehen, die
neue Rubrik verschiebt Verwertbarkeits-Aussagen sogar dorthin.

**Was es ablehnt**, jeweils vor dem ersten DB-Kontakt und für den ganzen Batch:

| Prüfung | Grund |
|---|---|
| Pitch außerhalb 110 bis 1200 Zeichen | Der kürzeste Pitch im Bestand hat 114 Zeichen, alles darunter ist ein Fragment |
| Verwertbarkeits-Vokabular (`Bildstrecke`, `dankbar`, `wertvoller Baustein`, `macht den Standort`) | Genau der Rückfall, den die Aktion beheben soll |
| ID unbekannt, nicht `analyzed`, oder ohne `press_score` | Ein Pitch an einem unbewerteten Satz wäre erfunden |
| Weniger als 120 Zeichen Inhalt | Dieselbe Fabrikations-Schwelle wie `candidates` und `apply` |

Der Guard hängt am Vokabular der Verwertbarkeit, nicht an einer Satzform. „Das
Verfahren eignet sich zur Diagnostik" ist Substanz und passiert; „eignet sich
für ein Feature" ist es nicht.

**Erfolgskontrolle** nach einem Durchgang, dieselbe Abfrage, die den Befund
erzeugt hat:

```sql
SELECT round(100.0*count(*) FILTER (WHERE pitch_suggestion ~ '(ÖAW|OeAW|Akademie der Wissenschaften)')/count(*)) AS nennt_oeaw
FROM publications
WHERE llm_model = 'anthropic/claude-opus-4.8-session' AND pitch_suggestion IS NOT NULL;
```

Vorher 0. Greift die neue Rubrik, sollte der Wert in Richtung 28 gehen.

## Veranstaltungen

### Kandidaten holen

```bash
PROD_DB_TUNNEL=1 node scripts/event-candidates.mjs --target=prod --limit=25
```

Die View `event_scoring_candidates` liefert nur **zukünftige** Events
(`event_at >= now()`) ohne Score. Vergangene unbewertete Events bleiben liegen,
sie haben keine Presserelevanz mehr. `content` ist HTML-bereinigt.

Nach einem neuen WebDB-Import erst
`PROD_DB_TUNNEL=1 npm run sync-events -- --target=prod --yes` fahren (der
MySQL-Container `oeaw-webdb-mysql` muss laufen). `upsertEvents` setzt bei
materieller Änderung eines Zukunfts-Events `analysis_status→pending` und die
Scores auf `NULL`, das Event fällt also automatisch in den Pool zurück.

### Bewerten

Vier Dimensionen 0.0–1.0, **kein Haiku**:

- **public_appeal** — Eignung für ein breites, fachfremdes Publikum. Hoch:
  öffentliche Vorträge, Ausstellungen, Lesungen, Podien, Aktionstage. Niedrig:
  interne Seminare, Workshops, Arbeitstreffen, Gremien.
- **scientific_significance** — Bedeutung von Thema und Vortragenden,
  Flaggschiff-Charakter, gesellschaftliche Tragweite.
- **reach** — Breite der Zielgruppe (überregional/allgemein vs. Nische).
- **timeliness** — aktueller Anlass: Diskurs, Jahrestag, Saison, Ereignis.

Die Gewichte sind **in der DB konfigurierbar** und stehen derzeit auf
public_appeal .32 · scientific_significance .32 · reach .21 · timeliness .15.
`computeEventScore` liest sie von dort; du lieferst nur die vier Dimensionen.
Relevant ist das nur, wenn jemand einen Score von Hand gegenrechnet.

Freitext wie bei Publikationen, aber knapper: **pitch_suggestion** 2–4 Sätze
Teaser für die Veranstaltungsseite, **suggested_angle** 1 Satz,
**target_audience** 1–3 Angaben, **reasoning** 2–3 Sätze rein inhaltlich.

**Kalibrierung** (aus dem prod-gescorten Bestand, Mittel ~0.23, Spanne 0.0–0.87):

| Bereich | Typ |
|---|---|
| 0.0–0.10 | interne/technische Seminare, Workshops, Group Meetings |
| 0.20–0.40 | spezialisierte öffentliche Vorträge und Kolloquien, enges Thema |
| 0.55–0.75 | öffentliche Vorträge mit breiter oder aktueller Resonanz |
| 0.80–0.90 | Flaggschiff-Events zu gesellschaftlichen Hot-Topics |

Viele Kandidaten sind Seminare und Fachvorträge, erwarte also eine linksschiefe
Verteilung mit mehreren Near-Zero-Items. Ehrlich aus dem Content bewerten.

Events mit Platzhalter-Titel (`Title to be announced`) bewusst niedrig
bewerten — sie fallen automatisch in den Pool zurück, sobald ein echter Titel
per `sync-events` ankommt. Nicht manuell nachhalten.

### Schreiben

Flaches JSON-**Array** (kein `evaluations`-Wrapper), keyed per Prod-`id`:

```json
[{ "id":"<prod-uuid>","public_appeal":0.0,"scientific_significance":0.0,"reach":0.0,
   "timeliness":0.0,"pitch_suggestion":"…","suggested_angle":"…",
   "target_audience":"…","reasoning":"…" }]
```

```bash
# 1. Trockenlauf
PROD_DB_TUNNEL=1 npm run apply-event-scores -- --target=prod --file=/tmp/events-batch-N.json
# 2. Schreiben
PROD_DB_TUNNEL=1 npm run apply-event-scores -- --target=prod --yes --apply --file=/tmp/events-batch-N.json
```

Jede Dimension muss gesetzt sein; eine fehlende bricht mit Item-Liste ab, statt
sie still auf 0 zu setzen. Ohne `--force` schützt `event_score IS NULL`. Der
Modell-Tag kommt aus `lib/shared/event-session-model.json` — bei einem neuen
Modell diese Datei anpassen, nicht das Skript. Genau deshalb stehen auf Prod
noch drei historische Tag-Varianten nebeneinander.

## Nachkontrolle

Nach jedem Batch Median, Spanne und die Ausreißer nach oben berichten, nicht nur
„fertig". Am Ende müssen beide Pools leer sein:

```sql
SELECT count(*) FROM publication_scoring_candidates
 WHERE created_at >= now() - interval '60 days';
SELECT count(*) FROM event_scoring_candidates;
```

## Nicht Teil davon

Der **Altbestand** von rund 3.500 Publikationskandidaten, überwiegend aus 2023,
bleibt bewusst liegen. `--all` würde ihn öffnen; als In-Chat-Aufgabe wären das
~50 Sitzungen. Empfehlung laut `docs/RESUME_SCORING_SPLIT_CODEREVIEW.md` §5:
ein CLI-Lauf über OpenRouter für 25–40 USD.

## Historie

- **2026-08-19** — 12 Publikationen nach dem Vollabzug, Median 0.2370, Spanne
  0.09–0.525, Mittel 0.2567. Der Stapel ist fast reine Gebirgsforschung: oben die
  europaweite Thermophilisierungs-Synthese aus 6.067 wiederholt aufgenommenen
  Vegetationsflächen (0.525, alpine Gipfel verschieben sich fünfmal stärker als
  Wald und Grasland), dahinter Flupyradifuron und die Futtersuche von Hummeln
  (0.442) und Nickel in Hochgebirgsquellen (0.4215). Unten zwei Textsorten ohne
  eigenen Befund, eine Buchbesprechung (0.093) und ein Zeitschriften-Editorial
  (0.111), dazu ein Parallelisierungs-Methodenpapier (0.09). Der Median liegt
  rund 0.12 unter dem Vorlauf, **das ist wieder Zusammensetzung**: kein
  sozialwissenschaftlicher VID-Block wie am 13.08., dafür Methodik, Taxonomie und
  zwei Nicht-Artikel. **Events desselben Laufs: 15 Stück, Median 0.1981, Spanne
  0.0819–0.676, Mittel 0.2348, Pool danach 0.** Klar oben die öffentliche Keynote
  von Caspar Hirschi zu Wissenschaftsfreiheit im Festsaal (0.676), dahinter das
  Symposium zur Geschichte der österreichischen Balkan-Archäologie (0.414); unten
  drei Platzhaltertermine ohne Titel (0.0819–0.0989) und textlose Institutsseminare.
  Zwei Sprachdubletten und eine Dreifacheintragung wurden bewusst identisch bewertet.
  **Modell-Tag korrigiert:** `lib/shared/session-model.json` und
  `lib/shared/event-session-model.json` sagten weiterhin 4.8, bewertet hat Opus 5 —
  jetzt `anthropic/claude-opus-5-session` bzw. `anthropic/claude-opus-5 (in-chat)`,
  beide passen unverändert in ihr `likePattern`.
- **2026-08-13** — 26 Publikationen nach dem Vollabzug, Median 0.3595, Spanne
  0.1475–0.601, Mittel 0.3574. Top: Karenzdauer österreichischer Eltern nach der
  ersten Geburt (0.601, 416 Tage bei Müttern gegen neun bei Vätern), dahinter
  Einsamkeitsverläufe in der Pandemie (0.4755) und die Geschlechterunterschiede
  beim Denkvermögen im Alter (0.472). Unten Software- und Theoriearbeiten
  (Binarisierungsbibliothek 0.1475, quarkflavorverletzende SUSY 0.184). Der
  Median liegt rund 0.09 über den drei Vorläufen (~0.26–0.27), **das ist
  Zusammensetzung, nicht Kalibrierungsdrift**: dieser Stapel enthält keinen
  GMI-Block, dafür fünf sozialwissenschaftliche VID-Arbeiten zu Karenz,
  Einsamkeit, Fertilität und Altern, die von der Rubrik her zu Recht höher
  liegen. Die harten Physik- und Methodenarbeiten sitzen unverändert bei
  0.15–0.31. Zwei Fragmente desselben Mondsee-Fundes wurden bewusst identisch
  bewertet (0.345). **Events desselben Laufs: 19 Stück, Median 0.3439, Spanne
  0.1043–0.6246, Mittel 0.3233, Pool danach 0.** Oben die zweiteilige
  PLATO-Öffentlichkeitsarbeit vor dem Missionsstart (Grazer Abendreihe 0.6246,
  Wiener Einzelvortrag 0.5631) und ein Konzertabend zu byzantinischem Gesang
  (0.4794); unten zwei Platzhaltertermine ohne Titel (je 0.1043) und ein
  GMI-Fachvortrag (0.1363). Der Mittelwert liegt über dem historischen ~0.23,
  weil in diesem Stapel nur drei reine Fachseminare stecken. Vier
  Sprachdubletten und eine Dreifachmeldung derselben NanoTrust-Tagung wurden
  bewusst identisch bewertet.
- **2026-07-31** — 11 Publikationen, Median 0.265, Spanne 0.166–0.583, Mittel
  0.3011. Top: Partnerschaftsauflösungen in Österreich 2018–2023 (0.583, einziges
  Item über 0.5), dahinter der LexAT21-Wortatlas (0.4235). Sechs GMI-Arbeiten aus
  Pflanzenbiologie und Chromatin bilden erwartungsgemäß den Block bei 0.20–0.37.
  Der Median liegt damit exakt im Korridor der beiden Vorläufe (~0.26 / 0.2715),
  die Kalibrierung hält. Events: Pool war leer.
- **2026-07-21** — erster Lauf nach der prod-first-Umstellung. 17 Publikationen
  (Median ~0.26, Spanne 0.124–0.523; Top: „Varieties of urban housing regimes"
  0.523) und 5 Events (Top: CERN-Generaldirektor Mark Thomson 0.739, praktisch
  identisch mit 0.727 desselben Termins vom 16.07. ⇒ Kalibrierung stabil).
  Beide Pools danach auf 0.
- **2026-07-16** — 18 Events nach WebDB-Re-Import, Top Schrödinger-Centenary
  0.655.
- **2026-06-25** — 29 Zukunfts-Events, Mittel ~0.25.
- **2026-06-17** — 194 Publikationen des WebDB-Re-Imports in 4 Batches. Damals
  war die lokale DB noch kanonisch und wurde anschließend auf Prod gepusht;
  dieser Weg ist seit dem Nacht-Ingest hinfällig.
