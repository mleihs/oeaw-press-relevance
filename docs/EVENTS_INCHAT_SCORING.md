# Resume: Upcoming-Events in-chat bewerten (NICHT über OpenRouter)

**User-Wunsch:** Claude bewertet die kommenden Veranstaltungen **direkt im Chat**
als Opus 4.8 (kein OpenRouter-Call, keine Kosten), schreibt die Scores dann via
Script in die **prod**-DB. Resume-Trigger nach `/clear`:
**„bewerte die upcoming events im chat"** → diese Datei lesen und durcharbeiten.

> Schwester-Doc: `docs/PUBLICATIONS_INCHAT_SCORING.md` (Publikationen). Der
> WebDB-Re-Import end-to-end ist `docs/WEBDB_IMPORT.md`.

## Schlüssel-Fakt: Events werden DIREKT AUF PROD bewertet

Anders als Publikationen (lokal kanonisch, dann gepusht) werden **Events gegen prod**
bewertet. Gründe (gelernt 2026-06-25):
- Lokale und prod-Event-Rows haben **verschiedene `id` (uuid)**. Stabiler
  Natural Key ist **`webdb_uid`** (TYPO3 news uid).
- `scripts/apply-event-scores.ts` matcht per **`id`**, also müssen die **prod**-ids
  verwendet werden. Die bestehenden in-chat-Scores wurden mit `--target=prod`
  geschrieben.
- Daher: Kandidaten von **prod** ziehen, bewerten, auf **prod** anwenden. Das lokale
  events-Table NICHT bewerten (ids matchen nicht).

Prod ist vorwärtsgerichtet: nur **zukünftige** Events (`event_at >= now()`) werden
bewertet. Vergangene unbewertete Events bleiben liegen (keine Presserelevanz mehr).

## Stand (2026-06-25, erledigt)

Frischer WebDB-Re-Import; `sync-events --target=prod` hatte die neuen Events nach prod
gebracht (UPSERT erhält die Analyse-Spalten, die 162 bereits gescorten Rows blieben
unangetastet). Die **29 Zukunfts-Events mit `event_score IS NULL`** wurden in-chat als
Opus 4.8 bewertet und auf prod geschrieben: **prod `events` 162 → 191 gescort,
Zukunfts-unscored → 0**, alle 29 mit Tag `anthropic/claude-opus-4.8 (in-chat)`,
Kosten 0. Kalibrierung hielt (Mittel ~0.25, Spanne 0.068–0.666, linksschief; Top:
Schrödinger-Centenary 0.666, Atomkriegs-Workshop 0.591, Forscherinnen-Ausstellung
0.545, Kinderuni 0.469; Boden ~0.07 interne Seminare / Calls for Papers). Die Pub-Seite
des Imports ist komplett live (prod == local: 38.916 Pubs / 8.001 scored, Embeddings
refreshed). **Nichts offen** — diese Datei bleibt das wiederverwendbare Runbook für den
nächsten Import (Trigger erneut feuern, wenn `event-candidates.mjs` wieder `count > 0`
liefert).

## Schritt 1 — unbewertete Events holen (neuer Puller)

```bash
node scripts/event-candidates.mjs --target=prod            # alle 29
node scripts/event-candidates.mjs --target=prod --limit=15 # Batch
```

Gibt JSON `{count, rubric_dims, events:[{id, webdb_uid, title, teaser, bodytext,
event_information, event_at, location_title, organizer_title, institute, url, lang,
content, content_chars}]}`. `content` ist HTML-bereinigt — direkt daraus bewerten.
`count: 0` ⇒ nichts mehr offen (nach einem neuen Import erst `sync-events
--target=prod`, dann tauchen die nächsten Zukunfts-Events auf).

## Schritt 2 — bewerten (Rubrik, identisch zu lib/server/events/prompts.ts)

Pro Event 4 Dimensionen (0.0–1.0). **KEIN Haiku** (anders als bei Pubs):
- **public_appeal** — Eignung für breites, fachfremdes Publikum. Hoch: öffentl.
  Vorträge, Ausstellungen, Lesungen, Podien, Aktionstage. Niedrig: interne
  Seminare, Workshops, Arbeitstreffen, Gremien.
- **scientific_significance** — Bedeutung Thema/Vortragende, Flaggschiff-Charakter,
  gesellschaftliche Tragweite.
- **reach** — Breite der Zielgruppe (überregional/allgemein vs. Nische).
- **timeliness** — aktueller Anlass: Diskurs, Jahrestag, Saison, Ereignis.

Gewichte (macht `computeEventScore`, du lieferst nur die 4 Dims): public_appeal .35 ·
scientific_significance .30 · reach .20 · timeliness .15.

Plus Freitext (Deutsch, echte Umlaute ä/ö/ü/ß — niemals ae/oe/ue/ss; KEINE
Gedankenstriche „—"; KEINE Anführungszeichen, die brechen das JSON):
- **pitch_suggestion** — 2-4 Sätze Teaser für die Veranstaltungsseite.
- **suggested_angle** — 1 Satz Aufhänger.
- **target_audience** — 1-3 Angaben (z.B. breite Öffentlichkeit, Fachpublikum).
- **reasoning** — 2-3 Sätze Begründung, rein inhaltlich, kein Feld-/Variablenname.

### Kalibrierung (aus den 162 prod-gescorten Events, 2026-06-25)
Mittel ~0.23, Spanne 0.0–0.87. Anker:
- **0.0–0.10**: interne/technische Seminare, Workshops, Group Meetings.
- **0.20–0.40**: spezialisierte öffentliche Vorträge/Kolloquien, enges Thema.
- **0.55–0.75**: öffentliche Vorträge mit breiter/aktueller Resonanz.
- **0.80–0.90**: Flaggschiff-Events zu gesellschaftlichen Hot-Topics (KI,
  Geopolitik, Klima, prominente Gastvorträge).
Viele der 29 sind Seminare/Fachvorträge → erwarte linksschiefe Verteilung mit
mehreren Near-Zero-Items. Ehrlich aus dem Content bewerten.

## Schritt 3 — schreiben

JSON-**Array** (flach, kein `{evaluations:…}`-Wrapper) in eine Temp-Datei, keyed
per **prod-`id`** aus dem Puller:
```json
[{ "id":"<prod-uuid>","public_appeal":0.0,"scientific_significance":0.0,"reach":0.0,
   "timeliness":0.0,"pitch_suggestion":"…","suggested_angle":"…",
   "target_audience":"…","reasoning":"…" }]
```
Dann anwenden (reuse computeEventScore, Provenienz `anthropic/claude-opus-4.8
(in-chat)`, cost 0; kein `--apply`-Flag, `--yes` bestätigt den prod-Write):
```bash
npm run apply-event-scores -- --target=prod --yes --file=/tmp/events-batch-N.json
```
Nach jedem Batch verifizieren:
```bash
PSQL=$(ls /opt/homebrew/Cellar/libpq/*/bin/psql | head -1)
URL=$(grep '^PROD_DB_URL_POOLER=' ~/.config/oeaw-press-release/prod-credentials | cut -d= -f2-)
"$PSQL" "$URL" -tAc "select count(*) filter (where event_score is null and event_at>=now()) from events;"
```
Wiederholen bis 0. Fertig, wenn alle Zukunfts-Events `analyzed`.

## Nicht vergessen
- KEIN OpenRouter-Lauf für Events (kein `npm run analyze-events`).
- Modell-Tag steht jetzt auf `anthropic/claude-opus-4.8 (in-chat)`
  (`scripts/apply-event-scores.ts`); die 139 Alt-Scores tragen `…-opus-4 (in-chat)`.
- Das Feature ist deployt (Vercel + VPS); Scores erscheinen live, sobald geschrieben.
- `scripts/event-candidates.mjs` ist neu (dieser Import) und uncommitted.
