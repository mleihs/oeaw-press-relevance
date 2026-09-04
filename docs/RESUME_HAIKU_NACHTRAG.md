# Resume: Haiku-Nachtrag für den 49er-Batch vom 2026-09-03

> **ERLEDIGT am 2026-09-03.** Alle 49 Haikus frisch geschrieben und per
> `apply … --force` auf Prod geschrieben: `Updated 49/49`. Nachkontrolle:
> `press_score` bei allen 49 unverändert (Drift 0), `haiku` bei allen 49
> gesetzt, Form 5-7-5 mit zwei ` / ` geprüft. Kohorte
> `anthropic/claude-opus-5-session` steht auf **61/61 = 100 %**.
> Der Auslöser ist mitbehoben: `docs/INCHAT_SCORING.md` führt das Feld nicht
> mehr als „optional", sondern als Pflicht.
>
> Der Rest dieses Records bleibt als Ablaufbeschreibung stehen, falls die
> Kohorte `opus-4.7-session` (5.143 Publikationen ohne Haiku) je nachgezogen
> werden soll. Dafür braucht es erst eine Freigabe.

**Einstieg:** `/weiter haiku` — oder diesen Record direkt lesen.

## Auftrag

Für **49 Publikationen** fehlt das `haiku`. Sie wurden am 2026-09-03 in-chat
bewertet (Modell-Tag `anthropic/claude-opus-5-session`), das Haiku-Feld blieb
aber leer, weil `docs/INCHAT_SCORING.md` es als „optional" führte und `apply`
es nicht verlangt. **Der Nutzer hat ausdrücklich verlangt, dass es immer
generiert wird.** Die Haikus sollen mit frischem Kontext entstehen, deshalb ist
die Aufgabe absichtlich von der Bewertungssitzung getrennt.

## Regeln für das Haiku

- Deutsch, **5-7-5 Silben**, Trenner genau `" / "` (Leerzeichen, Slash,
  Leerzeichen) — zwei Trenner pro Haiku.
- **Keine Anführungszeichen** in den Textfeldern, die brechen das JSON.
- Echte Umlaute ä/ö/ü/ß tippen, nie `ae/oe/ue/ss` als Ersatz. Aber nur Umlaute
  ersetzen: dass/muss/Fluss/lässt bleiben mit ss, ß nur nach langem Vokal oder
  Diphthong (Maß, weiß, groß, schließt).
- Keine Gedankenstriche.
- Es soll den **Inhalt** der Publikation fassen, nicht ihre Verwertbarkeit.
  Nicht das Institut oder das Journal benennen.
- Silben tatsächlich zählen. Kein Skript prüft das, und deutsche Komposita
  verführen zum Verzählen (`Sa-tel-li-ten-blick` = 5, `Na-tur-park` = 3).

## Ablauf

```bash
# 1. Die 49 Kandidaten samt Inhalt holen (sie sind bewertet, also NICHT im
#    candidates-Pool — über den Modell-Tag ziehen):
npx tsx scripts/session-pipeline.ts repitch-candidates 60 \
  --target=prod --model=anthropic/claude-opus-5-session > /tmp/haiku-kandidaten.json
```

`repitch-candidates` liefert `content`, `current_pitch` und `press_score` mit.
Es filtert allerdings auf ≥120 Zeichen Inhalt; die fünf Zenodo-Datensätze und
andere kurze Sätze fallen dabei möglicherweise heraus. Wer alle 49 braucht,
fragt sie direkt ab:

```sql
SELECT id, title, enriched_abstract, summary_de, summary_en, haiku
FROM publications
WHERE llm_model = 'anthropic/claude-opus-5-session' AND haiku IS NULL
ORDER BY published_at DESC NULLS LAST;
```

Ad-hoc-SQL gegen Prod: kleines `.mjs` mit `connectDb({target:'prod'})` aus
`scripts/lib/db.mjs`, absoluter Import wenn das Skript im Scratchpad liegt.

**Schreiben ohne die Bewertung anzufassen:** Es gibt keinen Haiku-only-Pfad.
Der Weg ist die vollständige Evaluation-JSON mit `haiku` plus `--force`:

```bash
npx tsx scripts/session-pipeline.ts apply /tmp/pubs-haiku.json --target=prod
npx tsx scripts/session-pipeline.ts apply /tmp/pubs-haiku.json --target=prod --apply --yes
```

`--force` hebt **nur** den `press_score IS NULL`-Guard auf, die SET-Liste ist
identisch. Werden dieselben fünf Dimensionen mitgeliefert, bleibt `press_score`
bitgleich; `decision`, `decided_at` und `flag_notes` fasst der UPDATE nie an.
Es müssen also die kompletten Evaluations erneut mit, nicht nur `id` + `haiku`.

**Die Original-Evaluations der 49 liegen in** der Session-Scratchpad-Datei
`pubs-a.json` / `pubs-b.json` (Pfad im Chat-Verlauf). Falls sie weg sind:
Dimensionen und Texte stehen alle in der DB und lassen sich von dort
rekonstruieren (`public_accessibility`, `societal_relevance`, `novelty_factor`,
`storytelling_potential`, `media_timeliness`, `pitch_suggestion`,
`target_audience`, `suggested_angle`, `reasoning`).

## Kontrolle danach

```sql
SELECT llm_model, count(*) AS bewertet, count(haiku) AS mit_haiku
FROM publications WHERE press_score IS NOT NULL GROUP BY 1;
```

Ziel: `opus-5-session` auf 100 %. Zusätzlich prüfen, dass `press_score` sich
nicht bewegt hat (vorher/nachher vergleichen, nicht bloß hoffen).

## Nicht Teil davon

Die Kohorte `anthropic/claude-opus-4.7-session` hat **5.143 Publikationen ohne
Haiku** (33,5 % Abdeckung). Das ist Altbestand aus früheren Sitzungen und war
nicht Gegenstand der Anweisung. Erst fragen, bevor man das anfasst.

## Verbindung

Prod ist für `session-pipeline` direkt erreichbar, kein Tunnel nötig. Für
Drizzle-Pfade (`apply-event-scores`, `audit-events-vs-dump`) braucht es
`npm run db:tunnel` + `PROD_DB_TUNNEL=1`; der Tunnel reißt gelegentlich ab,
dann `pkill -f '5433:127.0.0.1:5432'` und neu öffnen.
