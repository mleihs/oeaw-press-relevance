# Resume: Deep Dive „Bewertungs-Split" (Web/OpenRouter vs. In-Chat)

> **ERLEDIGT am 2026-07-21 — historisches Dokument, NICHT erneut ausführen.**
> Der Deep Dive ist gelaufen, der daraus abgeleitete Umsetzungsplan
> (`docs/RESUME_SCORING_SPLIT_IMPLEMENTATION.md`) ist ebenfalls umgesetzt und
> deployt. Der frühere Trigger-Header ist bewusst entfernt.

~~**Trigger nach `/clear`:** „lies docs/RESUME_SCORING_SPLIT_REVIEW.md und mach den
Deep Dive".~~ (historisch) Gedacht zur Ausführung mit **Fable**.

**Auftrag:** Der Bewertungsprozess ist über zwei Pfade gewachsen (Web-UI +
OpenRouter-API einerseits, In-Chat-Scoring andererseits). Das ist nie als Ganzes
überprüft worden. Diese Untersuchung soll **nicht** sofort umbauen, sondern erst
sauber befunden: was ist da, ist es logisch, ist es in der Web-UI bestmöglich
abgebildet — und wo klaffen Lücken. Ergebnis = Befund + priorisierter Vorschlag,
danach entscheidet der User, was gebaut wird.

Diese Datei ist ein **Rechercheauftrag mit Vorarbeit**, kein fertiger Befund. Die
„Vorbefunde" unten stammen aus einer schnellen grep-Sichtung (2026-07-21) und
sind **Hypothesen, die zu verifizieren sind** — nicht als Fakt übernehmen.

---

## 1. Die Leitfragen des Users (wörtlich, alle beantworten)

1. Bewertungssplit (Web-Plattform + OpenRouter-API **vs.** direkt im Chat) neu
   untersuchen — wann ist welcher Pfad richtig, ist die Trennung noch sinnvoll?
2. Wird alles **bestmöglich in der Web-UI abgebildet**?
3. Werden **unbewertete** Publikationen/Events ausgezeichnet?
4. Kann man im Web-Interface **einzeln** bewerten — und **alle** Publikationen
   bzw. Events **in einem Rutsch**?
5. Ist das alles **logisch**?
6. Gibt es ein **stabiles Script**, mit dem man den Prozess **hier im Chat**
   auslösen kann?
7. Ist **UI/UX generell für diesen Zweck optimal**?
8. Wird angezeigt, **wann welche Publikation/welches Event hinzugefügt bzw.
   aktualisiert** wurde?
9. Alles jeweils **UI-, UX- und technisch**-seitig bewerten.

---

## 2. Landkarte: was existiert (verifizierte Einstiegspunkte)

### Pfad A — Web-UI + OpenRouter (kostet Guthaben)

| Sache | Ort |
|---|---|
| Publikations-Batch | `app/api/analysis/batch/route.ts` |
| Events-Batch | `app/api/events/analyze/route.ts` |
| Batch-Logik | `lib/server/analysis/batch.ts`, `lib/server/events/analyze.ts` |
| Gemeinsames Modal | `components/scoring-modal.tsx` (`entity: 'publications' \| 'events'`) |
| Payload-Schema | `scoringBatchPayloadSchema` in `lib/shared/schemas.ts` |

Beide Routen: `requireUser()` + Run-Lock (`RUN_LOCK_KEYS`) + **SSE-Stream**,
`maxDuration = 300`. Modal-Aufrufstellen:
- `app/_components/scoring-status-tile.tsx` (Dashboard, **beide** Entitäten)
- `app/publications/_components/pipeline-actions.tsx`
- `app/events/_components/event-score-button.tsx`

### Pfad B — In-Chat (Claude bewertet selbst, €0)

| Sache | Ort |
|---|---|
| Publikations-Pipeline | `scripts/session-pipeline.ts` (Subcommands: `status`, `candidates`, `apply`, `haiku-patch`, `enrich-free`, `enrich-api`, `enrich-augment`, `doi-backfill`) |
| Events-Kandidaten | `scripts/event-candidates.mjs` |
| Events analysieren/anwenden | `scripts/analyze-events.ts`, `scripts/apply-event-scores.ts` |
| Runbooks | `docs/INCHAT_SCORING.md` |
| Rubrik / Kalibrierung | `docs/BEWERTUNGS_RUBRIK.md`, `docs/SCORING_VALIDATION.md`, `docs/EVENTS_SCORING_PROGRESS.md` |
| Triage-Konzept | `docs/TRIAGE_LOOP_PLAN.md` |

Etablierte Chat-Trigger (aus der Memory): „bewerte die neuen publikationen im
chat", „bewerte die upcoming events im chat".

### Gemeinsame Wahrheit (wichtig!)

`supabase/migrations/20260716000001_scoring_candidate_views.sql` definiert
`publication_scoring_candidates` und `event_scoring_candidates` als **DIE**
kanonische Kandidatenmenge. Vorher hatten In-Chat- und Server-Pfad
unterschiedliche Prädikate. Konsumenten: `lib/server/analysis/batch.ts`,
`lib/server/events/analyze.ts`, `lib/server/ingest/status.ts`,
`scripts/session-pipeline.ts`. **Jede Änderung muss diese Views respektieren,
nicht das Prädikat neu buchstabieren.**

Pub-Kandidat = `archived=false`, `analysis_status IN ('pending','failed')`,
`press_score IS NULL`, `enrichment_status IN ('enriched','partial','failed')`,
`is_ita_subtree=false`, Content-Gate ≥ 120 Zeichen.
Event-Kandidat = `event_at >= now()` **und** `event_score IS NULL`.

---

## 3. Vorbefunde (HYPOTHESEN — verifizieren, nicht glauben)

Diese Punkte sind aus grep entstanden und riechen nach den eigentlichen Antworten
auf die Leitfragen. Jeden am echten Code (und, wo nötig, an der laufenden UI)
prüfen.

**H1 — Einzelbewertung existiert vermutlich NICHT.**
`scoringBatchPayloadSchema` kennt nur `{limit, batchSize, forceReanalyze}` —
**kein `ids`-Feld**. Zum Vergleich: `enrichmentBatchPayloadSchema` hat sehr wohl
`ids`. Wenn das stimmt, kann man über die Web-UI *keine einzelne* Publikation und
*kein einzelnes* Event gezielt bewerten, nur „die nächsten N Kandidaten". Das ist
eine direkte Antwort auf Frage 4 und ein plausibler UX-Bruch: von einer
Detailseite aus ist die naheliegende Handlung „bewerte **das hier**".

**H2 — „Alles in einem Rutsch" ist in der UI nicht erreichbar, und wäre technisch
riskant.** Das Modal schickt `limit: cfg.limit` mit **hartkodiert** 20 (Pubs) bzw.
50 (Events); das Schema erlaubt bis 1000. Es gibt offenbar keine Eingabe, um das
zu erhöhen.
⚠️ **Und das ist womöglich Absicht:** Der Aufruf kommt aus dem **Browser** und
läuft damit über **Cloudflare, das jede Antwort nach 100 s kappt** (HTTP 524).
`maxDuration = 300` hilft dagegen nicht. Genau diese Falle wurde beim
Nightly-Ingest aufgedeckt und dort nur umgangen, weil der Cron **on-box** läuft
und per `--resolve` an Cloudflare vorbei aufs lokale Traefik zeigt — ein
Browser-Client kann das nicht. **Vor jedem Vorschlag „Button: alle bewerten"
klären, wie lange ein Lauf pro Item dauert und ob SSE die 100 s überlebt.**
(SSE liefert kontinuierlich Bytes — möglicherweise hält das die Verbindung offen.
Das ist eine **offene technische Frage, die empirisch zu klären ist**, nicht per
Vermutung.)

**H3 — Unbewertetes wird angezeigt, aber uneinheitlich.**
- Publikationen: `components/score-bar.tsx` → `PressScoreBadge` mit N/A-Gründen
  (`pickScoreNaExpl`, u. a. `score_na_analysis_failed`); benutzt in
  `components/publication-table.tsx` und `app/publications/_components/publication-list.tsx`.
- Events: `events-table.tsx`, `mobile-event-card.tsx`, `calendar-event-modal.tsx`
  → unbewertet ergibt `ScoreBand 'none'`.
- Dashboard: `app/_components/scoring-status-tile.tsx` zeigt Zähler + Ampel
  (`toneFor`: 0 = success, sonst warning, ab `SCORING_STALE_DANGER_DAYS` danger).

Zu prüfen: Ist „unbewertet" vom Nutzer **filterbar** (nicht nur sichtbar)? Es gibt
`filters.analysis` → `analysis_status` in `app/publications/_filters.ts` — reicht
das, und gibt es das Äquivalent bei Events? Ist die Sprache konsistent (N/A vs.
„nicht bewertet" vs. leerer Chip)?

**H4 — Zeitstempel sind schwach abgebildet (Frage 8).**
Gefunden: `app/publications/_constants.ts` kennt Sortierschlüssel `updated_at`
(„Zuletzt geändert"); `app/events/[id]/_components/event-detail.tsx` zeigt
„Synchronisiert: …". **Nicht gefunden:** eine sichtbare „hinzugefügt am"-Angabe
(`created_at`) in den Listen. Die Daten sind da — `getScoringStatus()` rechnet
mit `min(created_at)` der Kandidaten. Prüfen: Sieht der Nutzer irgendwo, *wann*
eine Pub/ein Event in den Bestand kam und wann sie zuletzt aktualisiert wurde?
Gerade nach dem nächtlichen Auto-Import ist „was ist neu seit gestern?" die
zentrale Frage — und aktuell vermutlich nur indirekt über Sortierung beantwortbar.

**H5 — Modell-Wahl ist geteilt und leicht verwirrend.** Das Modal lässt ein
OpenRouter-Modell wählen (`x-llm-model`-Header, `getLLMModel`), Default je Entität
verschieden. Aus der Memory: **Events-Default ist `deepseek/deepseek-chat`**;
`gemini-2.0-flash-001` ist auf OpenRouter **404**. Im Modal steht sinngemäß, dass
In-Chat-Scoring (Opus) kostenlos ist — d. h. die UI **verweist auf den anderen
Pfad**, kann ihn aber nicht auslösen. Genau hier sitzt die Split-Frage: Ist die
Web-UI ehrlich darüber, dass der bessere/günstigere Weg woanders liegt?

**H6 — Kalibrierungs-Konsistenz ist das eigentliche inhaltliche Risiko.** Der
In-Chat-Pfad existiert laut Runbooks ausdrücklich, um die Kalibrierung mit dem
bestehenden Korpus konsistent zu halten (€0, Opus). Wenn Teile des Korpus per
DeepSeek/OpenRouter und Teile per Opus bewertet sind, sind Scores nur begrenzt
vergleichbar. **Prüfen, ob das messbar ist** (z. B. Score-Verteilung nach
Bewertungsweg/Modell, falls das überhaupt gespeichert wird — falls nicht: *das*
ist ein Befund). Relevanz: `docs/SCORING_VALIDATION.md`.

---

## 4. Konkrete Prüfaufträge

### Technisch
- [ ] Stimmt H1? `ids` im Scoring-Payload wirklich nicht vorhanden — bis in
      `fetchPublicationsForAnalysis` / `fetchEventsForAnalysis` verfolgen.
- [ ] Was passiert bei `limit: 1000` real? Laufzeit/Item messen. Hält SSE die
      Cloudflare-100-s-Grenze aus? **Empirisch klären**, notfalls mit einem
      kleinen kontrollierten Lauf gegen Prod (Run-Lock beachten!).
- [ ] Run-Lock: Was sieht ein zweiter Nutzer bei 409? Ist das im Modal erklärt?
- [ ] Fehlerpfad: Was passiert bei Abbruch mitten im Batch — bleiben Items auf
      `analysis_status='pending'` liegen oder auf einem Zwischenstand?
- [ ] `forceReanalyze`: erreichbar in der UI? Verständlich, dass es überschreibt?
- [ ] Sind In-Chat- und Web-Pfad **wirklich** deckungsgleich? Beide sollen über
      die Kandidaten-Views gehen — nachrechnen, nicht auf den Kommentar vertrauen.
- [ ] `scripts/session-pipeline.ts`: Ist das das „stabile Script" (Frage 6)?
      Tatsächlich stabil, oder Session-Wegwerfware? Gibt es Tests? Ein
      dokumentiertes, wiederholbares Kommando von `status` bis `apply`?
      **Events und Publikationen laufen aktuell über *unterschiedliche* Scripts
      (`session-pipeline.ts` vs. `event-candidates.mjs`/`analyze-events.ts`) —
      ist das gerechtfertigt oder historisch gewachsen?**

### UI/UX
- [ ] Weg eines Nutzers, der wissen will „was ist neu und noch unbewertet?" —
      wie viele Klicks, ist er selbsterklärend?
- [ ] Ist von der **Detailseite** einer Pub/eines Events eine Bewertung
      auslösbar? Falls nein (H1): wie groß ist der Schmerz wirklich?
- [ ] Ist die Dashboard-Kachel der richtige Einstieg, oder ist der Einstieg
      dreifach verstreut (Kachel / Pipeline-Actions / Events-Button)?
- [ ] Sprache & Statusmodell: `pending` / `failed` / `analyzed` / N/A-Gründe —
      wie viel davon sieht der Nutzer, und versteht er es?
- [ ] Sichtbarkeit von „hinzugefügt am" / „aktualisiert am" (H4).
- [ ] Barrierefreiheit/Reduced-Motion im Modal-Stepper (Projektkonvention:
      `prefers-reduced-motion` wird respektiert, vgl. Konfetti-Lösung).

---

## 5. Kontext aus der laufenden Session (2026-07-21) — relevant, weil frisch

Direkt zuvor wurde das **Alarm-Verhalten des Nacht-Ingest** repariert und
deployt (Commit `40c70c4`, Vercel + Coolify). Was davon in diesen Deep Dive
hineinragt:

- **Neu: `lib/server/ingest/classify-run.ts`** (reine Funktion, 8 Tests). Regel:
  `ok:false` nur bei echtem Feed-Fehler **oder** Drift ≥ `DRIFT_ALARM_THRESHOLD`
  (25); `degraded` = angewandt mit vereinzelter Drift → **kein** Alarm, **keine**
  Mail, **kein** Sentry-Event.
- **Events-Import klassifiziert jetzt** statt pauschal zu scheitern: intakter
  Feed ohne neue Events → **`skipped`** (wird journalisiert!), keine
  Institutsgruppe → `failed`, alle Rohevents verworfen → `failed`.
  ⚠️ **Direkter Berührungspunkt:** `lib/server/ingest/status.ts` (die
  Dashboard-Kachel) liest die letzte `ingest_runs`-Zeile und setzt
  `lastImportFailed = status === 'failed'`. Der **neue Wert `skipped`** taucht
  dort ab jetzt auf. Prüfen, ob die Kachel das sinnvoll darstellt oder ob
  „skipped" als irritierender Zustand durchschlägt.
- **Backlog-Zahlen (2026-07-21, Prod):** ~**24.970** Pubs mit
  `enrichment_status='pending'`, ~**2.069** Scoring-Kandidaten. Enrichment
  drainiert nur ~200/Nacht (`INGEST_ENRICH_LIMIT`). Das ist der Maßstab für jede
  „alle in einem Rutsch"-Idee: **2.069 Kandidaten sind kein 20er-Batch.**
- **Cloudflare-100-s-Cap** — siehe H2, das ist die zentrale technische Fessel.
- Offener Upstream-Bug: Person `webdb_uid` 109935 wird vom ÖAW-Export
  referenziert, aber als leerer Datensatz geliefert (Pub 72489845 hat 1 statt 2
  Autor:innen). Für diesen Deep Dive nur als Beispiel für Datenqualität relevant.

### Betriebswissen, das man sofort braucht
- **Prod-DB-Zugriff:** `npm run db:tunnel` (SSH-Tunnel auf 5433) + `PROD_DB_TUNNEL=1`.
  **Kein** `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- **Kanonische Prod = metaspots** (`oeaw-press-tool.metaspots.net`, self-hosted
  Coolify). Vercel ist nur Hot-Standby. Der **Supabase-MCP zeigt auf die tote
  alte Cloud — nicht benutzen.**
- **Deploy metaspots ≠ `push origin main`.** Main→`chore/coolify-dockerfile`
  mergen (Worktree `/Users/mleihs/Dev/coolify-wt`) + Coolify-API-Trigger
  (App-UUID `cbt2tdcwf10ia0prqk8r45bm`). Coolify-API **nur on-box** erreichbar:
  `ssh metaspots "curl -s 'http://127.0.0.1:8000/api/v1/deploy?uuid=…' -H 'Authorization: Bearer <token>'"`,
  Token in `~/.config/metaspots/coolify-api.token`.
- **Nie `git add -A`** (Projekt-Gotcha). Turbopack frisst `@theme`-Änderungen →
  ggf. `.next` löschen.
- **Browser-Tool sparsam** — erst tsc/eslint/curl/Tests. Für UI-Fragen ist ein
  Blick aber legitim; dann gezielt.
- Em-Dashes sind per ESLint-Regel in UI-Text verboten (`no-restricted-syntax`).

---

## 6. Was am Ende herauskommen soll

1. **Befund je Leitfrage** (1–9), jeweils mit Beleg (Datei:Zeile) und der klaren
   Trennung „verifiziert" vs. „Vermutung".
2. **Bewertung, ob der Split noch trägt** — inkl. der ehrlichen Option „der
   OpenRouter-Pfad ist redundant" bzw. „der In-Chat-Pfad gehört produktisiert".
3. **Priorisierter Vorschlag** (klein → groß), mit Aufwand und Risiko. Explizit
   markieren, was an der Cloudflare-Grenze scheitert.
4. **Keine Umsetzung ohne Rückfrage.** Der User entscheidet nach dem Befund.

**Anti-Ziele:** kein Blind-Refactor der Kandidaten-Views (sie sind bewusst DIE
eine Wahrheit); keine neue Scoring-Semantik ohne Blick in
`docs/BEWERTUNGS_RUBRIK.md`; keine Prod-Schreibaktion ohne Ansage.
