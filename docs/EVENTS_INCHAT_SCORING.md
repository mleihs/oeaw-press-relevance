# Resume: Upcoming-Events in-chat bewerten (NICHT über OpenRouter)

**User-Wunsch:** Claude bewertet die kommenden Veranstaltungen **direkt im Chat**
(kein OpenRouter-Call, keine Kosten), schreibt die Scores dann via Script in die
prod-DB. Resume-Trigger nach `/clear`: **„bewerte die upcoming events im chat"** →
diese Datei lesen und durcharbeiten.

Stand bei Anlage: prod hat ~24 `analyzed` (OpenRouter-Smoke/Bulk, ~$0,012) und
**139 `failed`** (deepseek 429 rate-limited). Diese 139 + evtl. weitere `pending`
sind in-chat zu bewerten. Die OpenRouter-Pipeline (Modal/Route/CLI) bleibt im Code,
wird hier aber NICHT benutzt.

## Schritt 1 — unbewertete Events holen
```
PSQL=/opt/homebrew/opt/libpq/bin/psql; source ~/.config/oeaw-press-release/prod-credentials
$PSQL "$PROD_DB_URL_POOLER" -tAc "select id||'~~'||title||'~~'||coalesce(institute,'')||'~~'||coalesce(location_title,'')||'~~'||coalesce(organizer_title,'')||'~~'||left(regexp_replace(regexp_replace(coalesce(teaser,'')||' '||coalesce(bodytext,''),'<[^>]+>',' ','g'),'\s+',' ','g'),700) from events where event_at>=NOW() and analysis_status is distinct from 'analyzed' order by event_at;"
```
Format je Zeile: `id ~~ title ~~ institute ~~ location ~~ organizer ~~ text-snippet`.
In Batches von ~20-25 bewerten.

## Schritt 2 — bewerten (Rubrik, identisch zu lib/server/events/prompts.ts)
Pro Event 4 Dimensionen (0.0–1.0):
- **public_appeal** — Eignung für breites, fachfremdes Publikum. Hoch: öffentl.
  Vorträge, Ausstellungen, Lesungen, Podien, Aktionstage. Niedrig: interne
  Seminare, Workshops, Arbeitstreffen, Gremien.
- **scientific_significance** — Bedeutung Thema/Vortragende, Flaggschiff-Charakter,
  gesellschaftliche Tragweite.
- **reach** — Breite der Zielgruppe (überregional/allgemein vs. Nische).
- **timeliness** — aktueller Anlass: Diskurs, Jahrestag, Saison, Ereignis.

Gewichte (macht `computeEventScore`): public_appeal .35 · scientific_significance
.30 · reach .20 · timeliness .15.

Plus Freitext (Deutsch, echte Umlaute ä/ö/ü/ß, KEINE Gedankenstriche „—"):
- **pitch_suggestion** — 2-4 Sätze Teaser für die Veranstaltungsseite.
- **suggested_angle** — 1 Satz Aufhänger.
- **target_audience** — 1-3 Angaben (z.B. „breite Öffentlichkeit", „Fachpublikum").
- **reasoning** — 2-3 Sätze Begründung.

## Schritt 3 — schreiben
JSON-Array in eine Temp-Datei schreiben:
```json
[{ "id":"…","public_appeal":0.0,"scientific_significance":0.0,"reach":0.0,
   "timeliness":0.0,"pitch_suggestion":"…","suggested_angle":"…",
   "target_audience":"…","reasoning":"…" }]
```
Dann anwenden (reuse computeEventScore + korrekte Provenienz `…(in-chat)`, cost 0):
```
npm run apply-event-scores -- --target=prod --yes --file=/tmp/events-batch-N.json
```
Nach jedem Batch verifizieren:
```
$PSQL "$PROD_DB_URL_POOLER" -tAc "select analysis_status,count(*) from events where event_at>=NOW() group by 1;"
```
Wiederholen bis 0 unbewertet. Fertig, wenn alle upcoming `analyzed`.

## Nicht vergessen
- KEIN OpenRouter-Lauf für Events mehr (kein `npm run analyze-events`).
- Das Feature ist deployt (Vercel + VPS); die Scores erscheinen live, sobald geschrieben.
- Offene Code-Review-Notiz (separat, optional): kleine Rest-Duplikation Pubs↔Events
  (Pre-flight + hooks ~40 Zeilen) — laut Restraint-Regeln (ADR 0008) vertretbar; nur
  angehen, wenn der User „keine Duplikation" priorisiert. Siehe Review-Befund im Verlauf.
</content>
