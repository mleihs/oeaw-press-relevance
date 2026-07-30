---
description: Publikationen und Events in-chat gegen Prod bewerten (batchweise, ohne OpenRouter)
argument-hint: "[pubs|events|beides] [batchgröße, Default 25]"
---

Bewerte Publikationen und/oder Veranstaltungen **in-chat** — also von dir selbst,
nicht über OpenRouter. Das ist der kalibrierte Standardweg und kostet nichts; der
„Bewerten"-Knopf in der App ist nur der Fallback.

Umfang: `$1` (`pubs`, `events` oder `beides`; ohne Angabe **beides**).
Batchgröße: `$2` (ohne Angabe **25**).

## Grundregeln

- **Prod ist kanonisch.** Seit dem 2026-07-21 schreibt der Nacht-Ingest direkt auf
  Prod; die lokale DB ist nur ein Schnappschuss. Niemals lokal bewerten und
  hochschieben — du scorst sonst veraltete Zeilen und übersiehst die neuesten.
- **Rubriken** sind `lib/server/analysis/prompts.ts` (Publikationen) und
  `lib/server/events/prompts.ts` (Events). Halte dich exakt daran, damit die
  Bewertungen mit dem Bestand vergleichbar bleiben.
- **Jedes Schreib-Skript ist Dry-run per Default.** Erst ohne `--apply` fahren,
  Vorschau lesen, dann schreiben. Es gibt kein lokales Netz unter Prod.
- Arbeite in Batches und berichte nach jedem Batch Median, Spanne und die
  Ausreißer nach oben — nicht nur „fertig".

## Schritt 0 — Tunnel

```bash
if ! pgrep -f '5433:127.0.0.1:5432' >/dev/null; then npm run db:tunnel & sleep 3; fi
```

Danach jedem Prod-Befehl `PROD_DB_TUNNEL=1` voranstellen. **Kein**
`NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Publikationen

Zwei Fallen, beide real passiert:

1. **`sslmode` umschreiben.** `session-pipeline.mjs` baut seinen `pg.Client` roh
   aus `PG_DATABASE_URL`; node-pg behandelt `require` wie `verify-full` ⇒
   `self-signed certificate`. Deshalb auf `no-verify` umschreiben.
2. **`--imported-after` ist PFLICHT.** Ohne das Flag zieht `candidates` aus dem
   Gesamtpool (aktuell ~3.500, überwiegend AP7-Altbestand aus 2023) statt aus den
   frischen Eingängen. Das Fenster ist 60 Tage — dieselbe Menge, die auch der
   „Bewerten"-Knopf meint (`SCORING_RECENT_DAYS`).

```bash
export PG_DATABASE_URL="$(node -e "
  process.env.PROD_DB_TUNNEL='1';
  import('./scripts/lib/db.mjs').then(m =>
    console.log(m.loadDbUrl('prod').replace(/sslmode=[^&]*/, 'sslmode=no-verify')))
")"
CUTOFF=$(node -e "const d=new Date();d.setUTCDate(d.getUTCDate()-60);console.log(d.toISOString().slice(0,10))")
node scripts/session-pipeline.mjs candidates ${2:-25} --imported-after "$CUTOFF"
```

Bewerten, Ergebnis als JSON ablegen, dann:

```bash
node scripts/session-pipeline.mjs apply --file=/tmp/pubs-batch-N.json           # Trockenlauf
node scripts/session-pipeline.mjs apply --file=/tmp/pubs-batch-N.json --apply   # schreibt
```

## Events

```bash
PROD_DB_TUNNEL=1 node scripts/event-candidates.mjs --target=prod --limit=${2:-25}
```

Bewerten nach der Event-Rubrik, JSON-Array mit `id`, `public_appeal`,
`scientific_significance`, `reach`, `timeliness`, `pitch_suggestion`,
`suggested_angle`, `target_audience`, `reasoning`. **Jede Dimension muss gesetzt
sein** — eine fehlende bricht hart ab (früher wurde sie stillschweigend zu 0,
also zu einer erfundenen Bewertung).

```bash
PROD_DB_TUNNEL=1 npm run apply-event-scores -- --target=prod --file=/tmp/events-batch-N.json
PROD_DB_TUNNEL=1 npm run apply-event-scores -- --target=prod --yes --apply --file=/tmp/events-batch-N.json
```

`--force` nur, wenn bereits Bewertetes bewusst überschrieben werden soll; ohne
das Flag schützt der `event_score IS NULL`-Guard.

**Kein** `npm run analyze-events` — das wäre der OpenRouter-Weg.

## Nachkontrolle

```sql
SELECT count(*) FROM publication_scoring_candidates WHERE created_at >= now() - interval '60 days';
SELECT count(*) FROM event_scoring_candidates;
```

Beide sollten danach auf 0 stehen. Events mit Platzhalter-Titel
(`Title to be announced`) bewusst niedrig bewerten — sie fallen automatisch in
den Pool zurück, sobald ein echter Titel ankommt. Nicht manuell nachhalten.

## Referenz

`docs/PUBLICATIONS_INCHAT_SCORING.md` (Abschnitt „Stand 2026-07-21") und
`docs/EVENTS_INCHAT_SCORING.md`.
