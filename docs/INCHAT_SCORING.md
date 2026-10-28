# In-Chat-Bewertung: Publikationen und Veranstaltungen

Claude bewertet frische Publikationen und kommende Veranstaltungen **direkt im
Chat** und schreibt die Ergebnisse per Skript auf Prod. Kein OpenRouter-Call,
keine Kosten, und die Kalibrierung bleibt konsistent mit dem Bestand.

Einstieg: `/bewerten [pubs|events|beides] [Batchgröße]`.

**Seit 2026-10-28 bewertet die Nacht automatisch** (`docs/NIGHTLY_OPS.md`,
Abschnitt „Nachtbewertung"): derselbe Bewertungskern wie der Knopf, Opus 5.5 mit
Effort max, Lektorat mit high, Tag `anthropic/claude-opus-5.5-auto`. Das
In-Chat-Bewerten ist damit vor allem Nachkontrolle:

- `PROD_DB_TUNNEL=1 npm run scoring-run -- --target=prod --report-latest` zeigt
  je Entität den letzten Lauf mit verworfenen Haikus und Lektorat-Hinweisen.
- Ein verworfenes Haiku in-chat schreiben und mit `session-pipeline apply --force`
  nachtragen (Haiku ist Pflicht); Lektorat-Hinweise mit `repitch-apply` nachbessern.
- Event-Zwillinge prüfen: bekamen Sprachversionen und Kopien dieselben Dimensionen?
- Eine ganze Nachtkohorte neu bewerten: `npm run scoring-run -- --target=prod
  --rescore-tag=anthropic/claude-opus-5.5-auto --since=<datum>`.

Wofür In-Chat weiter das Mittel der Wahl ist: Altbestand außerhalb des
60-Tage-Fensters, Einträge, die die Nacht offen lässt (`failed_items`), und alles,
was ohne API-Kosten laufen soll.

| Tag | Herkunft |
|---|---|
| `anthropic/claude-opus-5.5-session` | In-Chat, Publikationen |
| `anthropic/claude-opus-5.5 (in-chat)` | In-Chat, Events |
| `anthropic/claude-opus-5.5-auto` | Bewertungskern: Nacht, Knopf, CLI |

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
  `npm run scoring-run` gehören zu diesem Weg; beides ist der Fallback.

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
mit DOI, dazu solche ohne DOI, die eine WebDB-Zusammenfassung mitbringen (die
übernimmt Phase 0, ohne einen DOI-Dienst zu fragen). Der Rest ohne DOI, rund
17.000 Sätze, bleibt
dauerhaft `pending`, weil es für ihn keine Quelle und keinen Text gibt.

Bis 2026-10-22 fehlte die Ausnahme für Zusammenfassungen: 37 Publikationen mit
`summary_de` blieben `pending` und kamen nie in den Bewertungspool. Sie wurden
an dem Tag einmalig per `session-pipeline enrich-free --target=prod --apply`
nachgezogen. Prüfen, ob wieder welche hängen (muss 0 sein):

```sql
SELECT count(*) FROM publications
WHERE archived = false AND enrichment_status = 'pending'
  AND (doi IS NULL OR doi = '')
  AND (summary_de <> '' OR summary_en <> '');
```

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
- **haiku** — **Pflicht**, Deutsch 5-7-5, Trenner `" / "` (zwei davon).
  Silben wirklich zählen (`Sa-tel-li-ten-blick` = 5, `Na-tur-park` = 3). Keine
  Anführungszeichen, keine Gedankenstriche, keine Ziffern, echte Umlaute. Es
  fasst den **Inhalt**, nicht die Verwertbarkeit, und benennt weder Institut
  noch Journal.

  `apply` prüft das seit 2026-09-03 hart und bricht mit Exit 1 ab: Struktur
  und 5-7-5, letzteres über drei unabhängige Zähler mit Mehrheitsentscheid.
  Wo keine Mehrheit zustande kommt, bricht es ebenfalls ab, und das Wort
  gehört mit Duden-Beleg in `lib/shared/scoring/haiku-lexicon.json`. Aufbau und
  Messungen: `docs/HAIKU_GATE.md`. Bestand prüfen:
  `npm run haiku-audit -- --target=prod`.

**Kalibrierung:** steht seit 2026-10-28 in der Rubrik selbst
(`PUBLICATION_CALIBRATION` in `lib/server/analysis/prompts.ts`): sechs Bereiche
von der hochspezialisierten Detailstudie (um 0.11) bis zum echten Pressethema
(ab 0.55), je mit typischen Dimensionswerten, abgeleitet aus der In-Chat-Kohorte
(Median 0.26). In-Chat und Nacht teilen sich diese eine Kalibrierung; bei
Abweichungen gewinnt die Rubrik. Ein dichter Fachblock (GMI-Pflanzenbiologie,
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

**Kalibrierung:** steht seit 2026-10-28 in der Rubrik selbst (`EVENT_CALIBRATION`
in `lib/server/events/prompts.ts`): fünf Bereiche von internen Seminaren (um
0.09) bis zu Flaggschiffen (ab 0.6), je mit typischen Dimensionswerten,
abgeleitet aus der In-Chat-Kohorte (Median 0.26). Sie ersetzt die früheren
Archetypen der Rubrik, die über der gelebten Praxis lagen.

Viele Kandidaten sind Seminare und Fachvorträge, erwarte also eine linksschiefe
Verteilung mit mehreren Near-Zero-Items. Ehrlich aus dem Content bewerten.

Events mit Platzhalter-Titel (`Title to be announced`) bewusst niedrig
bewerten. Der Wiedervorlage-Mechanismus greift, sobald der echte Titel bei uns
ankommt: `upsertEvents` setzt bei materieller Inhaltsänderung eines
Zukunfts-Events `analysis_status → pending` und die Scores auf `NULL`.

**Aber er greift nur über `sync-events` aus der WebDB, nicht über den
nächtlichen Feed.** Gemessen am 2026-09-03: von 74 Auslieferungen des Exports
in 35 Tagen wurden 74 am Tag der ANLAGE geliefert und keine einzige wegen einer
Änderung. Der Export ist ein Anlage-Delta (`crdate`), kein Änderungs-Delta
(`tstamp`). Eine Veranstaltung, die nach dem Anlegen bearbeitet wird — Titel
nachgetragen, Termin verschoben, Ort ergänzt — erreicht uns nie wieder, und
unsere Kopie friert auf dem Stand der Anlagenacht ein. Das betrifft nicht die
Ausnahme: 191 von 235 künftigen Events (81 %) wurden nach der Anlage noch
einmal geändert, im Mittel 133 Tage später.

Die Folge fürs Bewerten: **die Platzhalter halten sich selbst nicht nach.** Am
2026-09-03 trugen 3 von 40 Platzhaltern in TYPO3 längst einen echten Titel
(u. a. „The regulatory switches that made us human"), bei uns standen sie
weiter als `Title to be announced` mit einem Score um 0.10. Wer eine Serie
niedrig bewertet, sollte den Bestand daher gelegentlich gegen einen WebDB-Dump
prüfen:

```bash
npx tsx scripts/audit-events-vs-dump.ts --target=prod --drift
npx tsx scripts/audit-events-vs-dump.ts --target=prod --drift-only --phantoms
```

Solange das ÖAW-seitige Delta-Kriterium auf `crdate` steht, ist dieser Abgleich
die einzige Kontrolle. `sync-events --target=prod` ist KEIN Ersatz: es prunt
künftige Events, die seine Quelle nicht kennt (siehe `docs/WEBDB_IMPORT.md`).

**Reparieren** (2026-09-04 auf prod gelaufen, Drift danach 0):

```bash
npx tsx scripts/import-events-from-dump.ts --target=prod --refresh            # Trockenlauf
npx tsx scripts/import-events-from-dump.ts --target=prod --refresh --apply    # korrigiert
npx tsx scripts/import-events-from-dump.ts --target=prod --refresh --backfill --apply
```

`--refresh` korrigiert Felder, in denen TYPO3 etwas anderes stehen hat als wir.
Ändert sich dabei Titel, Teaser, Text oder Termin, setzt der Upsert die
Bewertung zurück auf `pending` — richtig so, ein Score zu einem alten Titel ist
falsch, nicht bloß alt. Am 2026-09-04 kostete das 44 Bewertungen (alle
`undecided`, es ging also keine redaktionelle Entscheidung verloren).

`--backfill` ist etwas anderes und darf nicht damit vermengt werden: es füllt
Felder, die bei UNS leer sind. Das ist keine Drift, sondern eine Lücke des
Feed-Pfads — der JSON-Export liefert `bodytext`, `url` und `lang` für viele
Zeilen gar nicht erst. Ohne Wertangabe füllt es nur Felder, die keinen Score
kosten; `--backfill=all` nimmt auch Titel, Teaser, Text und Termin und wirft
damit über hundert Bewertungen weg.

`--phantoms` zeigt die Gegenrichtung: Zeilen bei uns ohne sichtbares
Gegenstück in TYPO3. Stand 2026-09-04: 5 gelöscht, 3 versteckt, 11
Übersetzungen (DE/EN-Dubletten). Die Übersetzungen zu löschen wirkt nur
einmal, weil der JSON-Export kein `sys_language_uid` führt und der Feed sie
deshalb nicht erkennen kann; der dauerhafte Fix gehört in den Export.

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

- **2026-10-22** — 26 Publikationen in zwei Batches (24/2), Median 0.2863, Spanne
  0.1925–0.52, Mittel 0.3146; `haiku-audit` über die ganze Kohorte
  `opus-5.5-session` 144/144 sauber. **Batch 1 wurde komplett neu bewertet:**
  geschrieben hatte ihn zuerst eine Sitzung mit niedrigem Reasoning-Effort. Die
  Neubewertung mit Effort max entstand, ohne dass die alten Texte vorher gelesen
  wurden, und ging per `apply --force` auf Prod. Sie wich im Mittel um 0.039 ab,
  überwiegend nach unten (Batch-Median 0.3138 → 0.2863); seither wird in-chat nur
  mit Effort max bewertet. Oben die Homeoffice-Lücke nach Geschlecht und
  Elternschaft (VID, 0.52), der Umbau des Gehirns nach einer Verletzung der
  Sehrinde (IMBA, 0.5125, Preprint), gleichgeschlechtliche Familien in Österreich
  (VID, 0.451), die Schuttbedeckung der Gletscher in den Zentralanden seit 1985
  (IGF, 0.4405) und Balzgesänge männlicher Mäuse, die Weibchen nicht immer
  anlocken (ISF, 0.425). Zehn Arbeiten tragen keine ÖAW-Orgunit, fast alle zum
  Neolithikum und meist von Lasse van den Dikkenberg (0.22–0.3735); das Institut
  fehlt in diesen Pitches deshalb mit Absicht, und `fcfc67f9` hatte nur den
  Klappentext der Buchausgabe als Inhalt. Batch 2 bestand aus dem letzten
  Dikkenberg-Aufsatz, Vlaardingen-Kultur oder Stein-Gruppe (0.2515, Dimensionen
  am Block ausgerichtet), und einem ÖAI-Kapitel zur Klosterwirtschaft am Berg
  Nebo (0.343). `857a7814` bleibt aus dem Grund vom 07.10. offen. Pools danach
  1/44, die Events waren nicht Teil dieses Laufs. Altbestand 4.708, im Lauf
  unverändert (07.10.: 4.707). Am selben Tag kamen 37 Publikationen ohne DOI
  hinzu, deren Inhalt die Pressezusammenfassung des Instituts ist; `enrich-free`
  hatte sie aus dem Dauer-`pending` geholt (Schritt 0.5). 26 lagen im
  60-Tage-Fenster, 11 waren nur über `candidates --ids` erreichbar. Bewertet in
  zwei Batches (25/12), Median 0.2665, Mittel 0.2653, Spanne 0.0625–0.5105,
  `haiku-audit` danach 181/181. Oben die Verbuschung europäischer Berggipfel
  (IGF, 0.5105, 576 Dauerflächen über zwei Jahrzehnte), das Wiener Salonblatt
  und das Aufkommen des Lächelns (ACDH, 0.4325), der Forschungsbericht zu
  Jugendlichen am Reumannplatz (ISR, 0.4195) und zwei Standard-Blogs des IMAFO
  (0.413 und 0.4115). Unten zwei GitHub-Skripte (0.0625 und 0.0895), ein
  Nicäa-Aufsatz, von dem nur die Zitation vorlag (0.0955), und ein vierseitiges
  Wasserzeichen-Gutachten für eine Tagung (0.112). Die Vermittlungsformate des
  IMAFO (Blogs, zwei Podcasts, ein Magazinartikel) liegen bewusst bei 0.33 bis
  0.42 und damit unter den Werten der 4.7-Kohorte um 0.6, weil die Neuheit nur
  aus dem Inhalt kommt. Das RICAM-Papier zur photoakustischen Tomografie
  übernahm die Dimensionen seines schon bewerteten Workingpaper-Zwillings
  `4cd5c320` (0.219, Kohorte 4.7), die zwei Anlagen der Documenta Byzantina
  Imperialia sind identisch bewertet (0.132). Tag gesamt 63 Publikationen,
  Median 0.2735, Mittel 0.2856. Pools danach 1/19 (die Events liefen getrennt),
  Altbestand wieder 4.708 (zwischenzeitlich 4.719 mit den 11).
- **2026-10-07** — erster Lauf mit Opus 5.5, Modell-Tags dafür gehoben auf
  `anthropic/claude-opus-5.5-session` bzw. `anthropic/claude-opus-5.5 (in-chat)`.
  118 Publikationen in fünf Batches (25/25/25/25/18), Median 0.23, Spanne
  0.0625–0.6425, Mittel 0.2532, 118/118 Haikus laut `haiku-audit` sauber. Oben
  das neue österreichische Gletscherinventar (0.6425), die weltweiten Kosten von
  Depression bis 2050 (0.5545), Gesten von Elefanten in Konflikten (0.55),
  koloniale Altlasten in Hotspots biokultureller Vielfalt (0.5475) und das
  beschleunigte Pflanzensterben auf europäischen Gipfeln (0.5375). Die
  Batch-Mediane fallen von 0.3425 auf 0.165 in Batch 4, **das ist
  Zusammensetzung**: dort kamen 20 von 25 Einträgen aus dem ACDH, darunter
  sieben Handbuchkapitel (0.09–0.19). Bewusst am Boden, weil ohne Substanz: zwei
  GitHub-Changelogs (0.0625) und zwei ÖAI-Fundberichte, deren Band-DOI nur den
  Klappentext des ganzen Bandes liefert (0.0665). **`857a7814` „Water in
  Mountainscapes" bleibt unbewertet:** die WebDB-DOI ist der Platzhalter
  `10.1000/182`, OpenAlex hat dazu einen fremden Abstract geliefert; er bleibt
  im Pool, bis die Daten repariert sind. Zwölf Reasonings aus den ersten
  Batches wurden per `apply --force` neu geschrieben, weil „Für ein breites
  Publikum …" als zweiter Satz zur Schablone geworden war; Scores und übrige
  Texte blieben unverändert. **Events: 67 in drei Batches (25/25/17), Median
  0.2945, Spanne 0.066–0.573, Mittel 0.3104.** Oben die 18. Eric Wolf Lecture
  mit Alpa Shah zur radikalen Rechten (zwei Anlagen, je 0.573), die
  Gesamtsitzung zur Krise der Forschungsförderung (0.559) und der Dark Matter
  Day im WUK (0.55); unten GMI-Platzhalter ohne Titel (0.066). Im letzten Batch
  war die Hälfte der Einträge ohne jeden Text (vier GMI-Seminare, eine
  Lateinamerika-Konferenz in zwei Anlagen, drei `(copy n)`-Anlagen eines
  Kick-off-Workshops in Kairo); bewertet nur aus Titel und Metadaten, die Texte
  sagen das offen. Mehrfachanlagen desselben Vortrags, auch über Batchgrenzen
  hinweg, bekamen die Dimensionen des schon bewerteten Zwillings. Pools danach
  1/0 (nur `857a7814`), Altbestand unverändert 4.707.
- **2026-09-10** — 13 Publikationen, Median 0.2575, Spanne 0.1155–0.52, Mittel
  0.2738, 13/13 Haikus durchs Gate (einen Silben-Zählfehler hat das Gate im
  Trockenlauf abgefangen). Oben die Giraffenstudie des ISF, Löwenrufe gegen
  Madenhacker-Warnrufe (0.52), dahinter die Verschränkungsvertauschung über 143 km
  zwischen La Palma und Teneriffa (0.4225), Schnitzlers autobiografische Listen
  (0.4075) und die IQOQI-Klarstellung, warum auch klassische Gravitation
  verschränken kann (0.365). Unten eine Replik von 2003 ohne eigenen Befund
  (0.1155) und eine Optik-Kurzarbeit von 2014 (0.164). Vier nachgemeldete
  IQOQI-Altarbeiten (2003–2014) stecken im Stapel; ihre Aktualität ist bewusst
  niedrig bewertet. **Events: 18, Median 0.5385, Spanne 0.066–0.584.** Der Median
  ist verzerrt durch sechs Mehrfachanlagen von EPSC 2029 (je 0.584, zwei davon
  mit Ort und Datum der EANA 2024); ohne sie 12 Events mit Median 0.325. Oben
  EPSC, die MBI-Station bei der Langen Nacht der Museen (0.5745), die
  Buchpräsentation zum Entsatz von Wien 1683 (DE/EN je 0.539) und die Tagung zum
  Jubiläumsjahr 1526 (0.538); unten eine Doktoratsverteidigung (0.066). Pools
  danach 0/0, Altbestand 4.716 → 4.703.
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
