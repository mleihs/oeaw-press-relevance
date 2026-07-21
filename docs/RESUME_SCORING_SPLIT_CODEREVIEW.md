# Architektur- & Code-Review der Umsetzung vom 2026-07-21 — ABGESCHLOSSEN

Dieses Dokument war ein Resume-Trigger („lies … und führ es aus"). Der Auftrag
ist erledigt; was hier steht, ist jetzt das **Ergebnisprotokoll**. Es gibt
nichts mehr auszuführen.

---

## 1. Auftrag und Ablauf

Auftrag des Users: prüfen, ob die AP1–AP6-Umsetzung vom 2026-07-21
(`40c70c4..ab11294`, 8 Commits, 39 Dateien) „sauberste Architektur und
sauberster Code" ist. Kein Feature-Bau, ein Review mit Befund.

Ergebnis: **9 Befunde**, alle nach Rückfrage gefixt — je ein Commit,
`ab11294..5a49533`, 25 Dateien, +721/−230. Danach Migration angewendet und
beide Ziele deployt.

Die Faktenbasis liegt in `RESUME_SCORING_SPLIT_REVIEW.md` (Befund) und
`RESUME_SCORING_SPLIT_IMPLEMENTATION.md` (Auftrag). **AP7 (Backlog-Strategie)
ist weiterhin nicht gebaut** — das ist eine Entscheidungsvorlage, kein
Arbeitspaket.

## 2. Die 9 Befunde und ihre Fixes

| # | Befund | Commit |
|---|---|---|
| 1 | `estimateCost` rechnete mit hartkodierten Preisen UND einem 50/50-Mischpreis, obwohl OpenRouter `prompt_tokens`/`completion_tokens` getrennt liefert. Systematische Überschätzung, persistiert in `analysis_cost`. | `ba6fade` |
| 2 | Modal schrieb `'anthropic/claude-opus-4.8'` als Literal statt `DEFAULT_LLM_MODEL` — obwohl AP2 genau das bündeln wollte. | `25f80c1` |
| 3 | Kachel-Deep-Link `?analysis=pending` traf die gezählte Menge nicht (17 vs. Tausende). | `3b1682c` |
| 4 | `stampFmt` in `detail-client.tsx` ohne `timeZone` → Hydration-Mismatch bei timestamptz zwischen 00:00 und 02:00 MESZ. | `04edd5d` |
| 5 | Events-Force-Pfad buchstabierte `event_at >= NOW()` im TypeScript nach, statt eine View zu lesen. | `0b2e43f` |
| 6 | Modell-Picker stand zweimal wortgleich da (Bewerten-Modal + Social-Refresh). | `5b0945d` |
| 7 | `SINGLE_ENTITY` war ein Spread mit toten Feldern (`limit: 1` ignoriert der Server, `defaultModel` überall gleich). | `25f80c1` |
| 8 | Keine Tests für `fetchEventsForAnalysis` und `getScoringStatus`, obwohl beide neue Logik tragen. | `0b2e43f`, `fd4a426` |
| 9 | `skipped` rechnete die Route über Fetcher-Interna; doppelte `ids` blähten die Zahl auf. | `7b5739f` |

Dazu `5a49533`: `docs/IMPLEMENTATION.md` und `content/help/scores/pitch-felder.mdx`
standen noch auf `claude-sonnet-4` bzw. auf Modellen, die es im Picker nie gab.

### Was ich geprüft und NICHT beanstandet habe

`sql.raw` für den View-Namen (zwei feste Literale an einem Boolean, kein
Injektionsweg) · `make_interval(days => $1::int)` ist die richtige, sargable
Form · `created_at IS NULL` verschluckt nichts, weil `publications.created_at`
`notNull()` ist (Invariante, nicht Beobachtung) · das `inflight`-Handling in
`llm-pricing.ts` ist rennfrei · `and(eq(id), isNull(eventScore))` +
`.returning()` in `apply-event-scores.ts` tut, was der Commit behauptet ·
`backlogCount: 0` bei Events ist durch `event_at >= now()` gedeckt.

## 3. Neue Architektur-Regeln aus diesem Review

Drei Dinge, die beim Fixen aufgefallen sind und für künftige Arbeit gelten:

1. **`import 'server-only'` bricht den tsx-Skript-Pfad.** `lib/server/llm-pricing.ts`
   musste den Marker abgeben, damit `openrouter.ts` die Live-Preise ziehen kann,
   ohne `scripts/analyze-events.ts` mit `Cannot find module 'server-only'` zu
   killen. Faustregel: der Marker gehört an Module mit Geheimnissen oder
   DB-Zugriff, nicht an jedes Modul unter `lib/server/`.
2. **`SELECT *`-Views per DROP+CREATE migrieren, nicht per CREATE OR REPLACE.**
   Die Spaltenliste friert beim Anlegen ein, und ein REPLACE verlangt exakt
   dieselbe Spaltenzahl wie die bestehende View — hat die Basistabelle seither
   eine Spalte bekommen, bricht die Migration ab. DROP+CREATE innerhalb der
   Migrations-Transaktion ist von dieser Drift unabhängig und für Leser nie
   sichtbar leer. (`20260721000001` löste das noch per Preflight; funktioniert,
   verlässt sich aber darauf, dass jemand den Preflight fährt.)
3. **Drizzle-Filter sind ohne DB testbar:** `new PgDialect().sqlToQuery(sql)`
   rendert den parametrisierten Text. So hängen jetzt `buildAnalysisScopeWhere`,
   `buildEventScopeWhere`, `scoringScopeClause` und die `getScoringStatus`-Query
   an Tests — die vier Stellen, die denselben Scope meinen müssen. Driftet eine,
   verspricht die Kachel etwas, das der Klick nicht einlöst.

## 4. Deploy-Protokoll

- Migration `20260721000002_event_rescore_pool.sql` auf der kanonischen Prod
  (metaspots) **appliziert**, transaktional mit Parität als Abbruchbedingung:
  `event_scoring_candidates` 5 == 5 Zeilen, 32 == 32 Spalten, id-Menge
  identisch, `event_rescore_pool` 164 Zeilen. Alle vier Views verifiziert.
  Prod führt **kein** `supabase_migrations.schema_migrations` (bekannte,
  bewusste Drift — Migrationen werden von Hand angewendet).
- Vercel: `main` gepusht (`ab11294..5a49533`).
- metaspots: `chore/coolify-dockerfile` gemergt + gepusht (`aa0b0c7..2ccf663`),
  Coolify-Deploy `dto0e7n720hhqkh4wzz1y8pj` angestoßen.
- Gates vor dem Push grün: typecheck, lint, 701 Tests, `check-em-dashes`.
- Kein echter Bewertungslauf gefahren (kostet Guthaben, schreibt Scores).

## 5. Was offen bleibt

- **AP7 Backlog-Strategie** — die 2.354 Altbestands-Kandidaten. Entscheidung
  steht aus: on-box CLI für Publikationen (das Pendant zu
  `scripts/analyze-events.ts` fehlt) oder In-Chat-Kampagne. Seit `3b1682c` ist
  der Altbestand immerhin aus der Kachel heraus sichtbar
  (`/publications?scoring=backlog`).
- **Aufräum-Skript für die `llm_model`-Tag-Varianten** auf Prod (drei Schreibweisen
  nebeneinander, verfälscht jede Auswertung nach Modell). In AP6 nur der
  Neuschreib-Pfad vereinheitlicht, der Bestand nicht.
- **Der geschützte UPDATE-Pfad von `apply-event-scores.ts` ist nie gegen eine
  Live-DB gefahren.** Die Drizzle-Semantik ist eindeutig, ein echter Lauf
  schriebe aber Scores.
- **`?scoring=` hat kein Bedienelement** im Filter-Sheet, nur den Deep-Link und
  den entfernbaren Chip. Bewusst so: der Filter beantwortet eine Frage, die man
  von der Kachel aus stellt, nicht eine, die man in der Liste zusammenklickt.
