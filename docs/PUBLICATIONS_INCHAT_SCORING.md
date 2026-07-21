# Resume: neue Publikationen (Import 2026-06-17) in-chat bewerten

**User-Wunsch:** Claude bewertet die neu importierten Publikationen **direkt im Chat**
(Session-Scoring, €0, kein OpenRouter — hält die Kalibrierung konsistent mit dem
bestehenden Korpus), in **Batches von 50**, damit der Context nicht vollläuft.
Resume-Trigger nach `/clear`: **„bewerte die neuen publikationen im chat"** →
diese Datei lesen und durcharbeiten.

**Stand bei Anlage (2026-06-17):** Frischer WebDB-Re-Import fertig (235 neue Pubs,
davon 199 bewertbar / **194 ohne ITA**). Enrichment 2024+ gelaufen (166 enriched).
Lokal ist kanonisch; Prod-Push ist Schritt 4 (separat, mit Backup).
→ **194 bewertbare neue Pubs ⇒ ~4 Batches** (50+50+50+44). Die 5 ITA-Pubs bleiben
ungescort (Prod-Sync-Policy schließt ITA aus).

**FORTSCHRITT (2026-06-17):**
- [x] Batch 1: 50 appliziert.
- [x] Batch 2: 50 appliziert (Guard sauber, Kalibrierung stimmig; Top-Pub 19c770e6
  „Trans-Stimme/Medizinausbildung" press_score 0.508, der GMI-Pflanzenbiologie-Block
  nischig bei 0.15–0.30).
- [x] Batch 3: 50 appliziert (Guard sauber: 0 Umlaut-Artefakte, 0 Reasoning-Leaks, alle
  analyzed). Fast reiner GMI-Pflanzenbio/Chromatin/Crosslinking-MS-Block wie erwartet:
  Median press_score 0.207, Masse 0.15–0.30. Top-Pub 88ff24ba „Ganymede" (IWF-Buch vor
  ESA-JUICE-Mission) 0.486; danach 68d1a224 Mais-Domestikation Tehuacán 0.352; Boden
  cb89b10d (Author-Correction, kein Presseanlass) 0.055. **Verbleibend: 44 ⇒ 1 finaler Batch.**
- [x] Batch 4 (final): 44 appliziert (Guard sauber: 0 Umlaut-Artefakte, 0 Flag-Leaks, 0
  Typo-Verstöße; Updated 44/44). Wieder ein GMI-Pflanzenbio/Chromatin/Epigenetik-Block:
  Median press_score 0.23, Spanne 0.127–0.401. Top-Pub db1f8231 „Glyphosat/Bryophyten"
  (warum Moose das Herbizid tolerieren) 0.401; danach f4889fdc Tropenbaum-Mutationen
  Borneo 0.363 und d965e177 Mais-Domestikation Tehuacán (Preprint zu Batch-3-Pub) 0.356.
  Schlusslichter: Methoden/Review-Papers (GWAS-Guide 041dd13a 0.127, Bisulfit 0.132).
  **`candidates … count: 0` bestätigt ⇒ alle 194 bewertbaren neuen Pubs gescort.**

**SCORING KOMPLETT (2026-06-17).** Offen ist nur noch Schritt 4 (Prod-Push, separat, mit
Backup) sowie die separate DOI-Matchfrage gegen TYPO3-Presse-News (siehe Session-Notiz unten).

## Voraussetzung (einmal pro Session)
- MySQL-Container wird zum Bewerten **nicht** gebraucht (Scoring liest nur lokal PG :54422).
- Rubrik einmal lesen: `lib/server/analysis/prompts.ts`.

## Schritt 1 — nächste 50 holen
```
node scripts/session-pipeline.mjs candidates 50 --imported-after 2026-06-17
```
- Liefert JSON; jede Pub trägt ihren `content` (direkt daraus bewerten, keine DB-Query nötig).
- `--imported-after 2026-06-17` scoped **nur auf diesen Import** (nicht den 26k-Vor-2024-Backlog).
- `count: 0` ⇒ fertig, alle neuen Pubs bewertet.
- Hinweis: max. Limit ist 200; mit 50 bleibt der Context handlich. `apply` markiert
  bewertete Rows als `analyzed`, sie fallen also aus dem Kandidaten-Pool — voll resumierbar,
  die DB (`analysis_status`) ist das Fortschritts-Ledger.

## Schritt 2 — bewerten (Rubrik = lib/server/analysis/prompts.ts)
Pro Pub **5 Dimensionen** 0.0–1.0 (Gewichte in lib/shared/score-weights.json):
- **novelty_factor** .40
- **storytelling_potential** .30
- **public_accessibility** .15
- **media_timeliness** .10
- **societal_relevance** .05

`press_score` wird aus den Dims berechnet (NICHT selbst setzen).
Kalibrierung: typische Fachpubs ~0.28–0.43, nischig-technisch ~0.15–0.25,
echt presse­würdig 0.5–0.7.

Plus Freitext (Deutsch, echte Umlaute ä/ö/ü/ß):
- **pitch_suggestion** — 4–6 Sätze.
- **target_audience** — kurze Angabe(n).
- **suggested_angle** — 1 Satz Aufhänger.
- **reasoning** — 2–3 Sätze, **nur aus dem Inhalt** — NIE `peer_reviewed` /
  `popular_science` / `mahighlight` benennen (apply blockt das mit Exit 1).
- **haiku** — optional, Deutsch 5-7-5, „ / "-Trenner, echte Umlaute (nie ae/oe/ue/ss).

**FORMAT-REGELN (kosten sonst Rework):**
- **UMLAUTE SOFORT RICHTIG:** echte ä/ö/ü/ß direkt tippen, NIE ae/oe/ue/ss als
  Ersatz (Schreibmaschinen-Optik, projektweit unerwünscht). Achtung: NUR Umlaute
  ersetzen — „dass/muss/Fluss/Wasser/lässt" bleiben mit ss, ß nur nach langem
  Vokal/Diphthong (Maß, Eiweiß, weiß, groß, schließt). `apply` prüft das NICHT,
  also ist es allein meine Verantwortung. Tipp: im Generator-Skript einen Guard
  einbauen, der bei Rest-Artefakten (fuer|ueber|koenn|waer|Oester…) mit Exit 1
  abbricht, bevor die Batch-JSON geschrieben wird.
- KEINE Anführungszeichen (" „ ") in den Textfeldern (brechen das JSON).
- KEINE Gedankenstriche „—" (apply wandelt sie zwar zu Komma, lieber gleich Komma/
  Doppelpunkt). apply stoppt, falls eine Row <120 Zeichen content hat (dann droppen).

## Schritt 3 — schreiben
JSON in eine Temp-Datei:
```json
{"evaluations":[
  {"id":"…","novelty_factor":0.0,"storytelling_potential":0.0,
   "public_accessibility":0.0,"media_timeliness":0.0,"societal_relevance":0.0,
   "pitch_suggestion":"…","target_audience":"…","suggested_angle":"…",
   "reasoning":"…","haiku":"… / … / …"}
]}
```
Erst Dry-Run, dann anwenden:
```
node scripts/session-pipeline.mjs apply /tmp/pubs-batch-N.json            # dry-run
node scripts/session-pipeline.mjs apply /tmp/pubs-batch-N.json --apply    # schreibt
```
Modell-Tag wird automatisch gesetzt (`anthropic/claude-opus-4.8-session` aus
lib/shared/session-model.json), Kosten 0.

**Wiederholen** (Schritt 1–3) bis `candidates … count: 0`. Realistisch 4 Batches.

## Schritt 4 — nach dem Scoring: Prod-Push (separat, mit Backup)
Erst Backup (libpq pg_dump, Session-Pooler :5432 — siehe docs/WEBDB_IMPORT.md
„Pushing to production"), dann:
```
node scripts/push-analysis-to-prod.mjs --apply       # UPDATE Scores auf in-prod-Rows (prod-NULL-only)
node scripts/sync-missing-pubs-to-prod.mjs --apply    # INSERT brandneue Rows + Relationen
```
Danach JSONB-Integritätscheck auf prod (flag_notes muss überall 'array' sein) —
siehe docs/WEBDB_IMPORT.md „Verifying prod is live".

## Nebenbei offen (separater Flow): neue EVENTS
Dieser Import brachte **29 neue Events** (lokal gesynct, noch unbewertet). Die laufen
über den eigenen in-chat-Events-Flow: **docs/EVENTS_INCHAT_SCORING.md** (Trigger
„bewerte die upcoming events im chat"). Nicht Teil der Publikations-Batches hier.
</content>
</invoke>

---

# Stand 2026-07-21 — WICHTIG: Prod ist voraus, LOKAL NICHT MEHR KANONISCH

Alles oberhalb dieser Linie beschreibt den WebDB-Re-Import vom 2026-06-17, bei dem
die lokale DB die Wahrheit war und Prod danach nachgezogen wurde. **Für den
laufenden Betrieb gilt das nicht mehr.** Seit dem Nightly-Ingest (06:00, seit
2026-07-16) importiert die Pipeline **direkt auf Prod**; die lokale DB ist ein
Schnappschuss vom letzten manuellen Import.

Gemessen am 2026-07-21:

| | frische Kandidaten (60-Tage-Fenster) | jüngster Eingang |
|---|---|---|
| lokal | 7 | 2026-07-16 |
| **prod** | **17** | 2026-07-20 |

Wer nach dem alten Ablauf lokal bewertet, scort also veraltete Zeilen und
übersieht die neuesten. **Publikationen laufen jetzt wie Events: Kandidaten von
Prod ziehen, bewerten, auf Prod anwenden.**

## Ablauf (Publikationen, gegen Prod)

```bash
npm run db:tunnel          # eigenes Terminal, offen lassen
```

`scripts/session-pipeline.mjs` liest `PG_DATABASE_URL` (Default = lokal), also
muss die Prod-URL gesetzt werden — der Tunnel liegt auf 127.0.0.1:5433:

```bash
export PG_DATABASE_URL="$(node -e "
  process.env.PROD_DB_TUNNEL='1';
  import('./scripts/lib/db.mjs').then(m => console.log(m.loadDbUrl('prod')))
")"
node scripts/session-pipeline.mjs candidates 50      # ohne --imported-after
```

`--imported-after` weglassen: das Flag scopte auf den 06-17-Import. Der
Kandidaten-Pool ist heute `publication_scoring_candidates`, und der
**Bewerten-Knopf-Scope** (frisch = `created_at >= now() - 60 Tage`) ist genau die
Menge, um die es hier geht. Der Rest ist der Altbestand aus AP7 (2.354 Stück,
bewusst pending, siehe `docs/RESUME_SCORING_SPLIT_CODEREVIEW.md` §5).

Bewerten und anwenden dann wie oben beschrieben (Rubrik
`lib/server/analysis/prompts.ts`, `apply` ist DRY-RUN by default).

**Vorsicht:** direkt auf Prod schreiben heißt, es gibt kein lokales Netz mehr
darunter. `apply` erst ohne `--apply` fahren und die Vorschau lesen.

## Events im selben Zug

`docs/EVENTS_INCHAT_SCORING.md` ist unverändert gültig (Events waren immer schon
prod-first). Offen am 2026-07-21: **5 Kandidaten** in `event_scoring_candidates`.
Das Anwenden-Skript `scripts/apply-event-scores.ts` wurde am 2026-07-21 gehärtet
(Dry-run-Default, harte Validierung, `isNull(event_score)`-Guard, `--force`) und
gegen die lokale DB in allen sechs Verhaltensweisen verifiziert.
