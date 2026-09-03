# Resume: Umsetzung Bewertungs-Split (Befund → Code)

> **ERLEDIGT am 2026-07-21 — historisches Dokument, NICHT erneut ausführen.**
> AP1–AP6 sind umgesetzt, reviewt und deployt (Ergebnisprotokoll:
> `docs/RESUME_SCORING_SPLIT_CODEREVIEW.md`); offen blieb nur AP7 (Altbestand,
> s. Memory `scoring-split-review-pending`). Der frühere Trigger-Header
> („lies … und setz es um") ist bewusst entfernt.

~~**Trigger nach `/clear`:** „lies docs/RESUME_SCORING_SPLIT_IMPLEMENTATION.md und
setz es um".~~ (historisch) Gedacht zur Ausführung mit **Claude Opus (high)**.

**Kontext:** Der Deep Dive `docs/RESUME_SCORING_SPLIT_REVIEW.md` ist erledigt
(Befund 2026-07-21, Fable-Session). Dieses Dokument ist der daraus abgeleitete,
vom User beauftragte Umsetzungsplan. Die Faktenbasis in §1 ist **verifiziert**
(Code + Prod-DB read-only + OpenRouter-API) — nicht neu recherchieren.

**Vom User fixierte Entscheidungen:**
1. „Alle bewerten" im Web heißt ab jetzt: **nur neue Kandidaten, Fenster 60 Tage**
   (nach `created_at`). Der Altbestand (~2.371 Pubs) bleibt dem In-Chat-Pfad
   vorbehalten — Kostenschutz.
2. **OpenRouter-Default beider Entitäten = `anthropic/claude-opus-4.8`** (das
   Korpus-Modell; DeepSeek-Drift ist gemessen, s. §1).
3. **Preise im Model-Picker dynamisch** von der OpenRouter-API, **~1×/Tag
   gecached**, statische Werte nur als Fallback.

**Anti-Ziele (unverändert aus dem Review):** kein Blind-Refactor der
Kandidaten-Views (sie sind DIE Wahrheit; §3/AP1 erweitert sie nur additiv und
semantikerhaltend); keine neue Scoring-Semantik ohne `docs/BEWERTUNGS_RUBRIK.md`;
keine Prod-Schreibaktion ohne Ansage (Migration + Deploy sind Teil des Auftrags,
ein Test-Bewertungslauf gegen Prod NICHT — vorher fragen).

---

## 1. Verifizierte Faktenbasis (2026-07-21, nicht neu erheben)

**Prod-Scores nach `llm_model`** (read-only via Tunnel abgefragt):
- Publikationen: 8.077/8.078 via Opus-Session (`anthropic/claude-opus-4.7-session`
  7.734, `…4.8-session` 343), **0 via OpenRouter**. avg ≈ 0.253/0.257.
- Events: 218/227 in-chat (drei Tag-Varianten! `opus-4.8 (in-chat rubric v2)` 168,
  `anthropic/claude-opus-4.8 (in-chat)` 34, `anthropic/claude-opus-4 (in-chat)` 16),
  **9 via `deepseek/deepseek-chat` mit avg 0.532** vs. ~0.18–0.26 bei Opus →
  Kalibrierungs-Drift ist real und messbar.
- Backlog: 2.371 Pub-Kandidaten (ältester `created_at` 2026-04-26, nur 7 aus den
  letzten 7 Tagen), 5 Event-Kandidaten, 24.323 enrichment-pending.

**OpenRouter-Preise (Live-Check 2026-07-21, $/M in|out):**
`anthropic/claude-opus-4.8` 5|25 · `anthropic/claude-sonnet-5` 2|10 ·
`anthropic/claude-sonnet-4` 3|15. `google/gemini-2.0-flash-001` ist auf
OpenRouter tot (404, Memory `events-scoring-deepseek`).

**Zentrale Code-Fakten:**
- `scoringBatchPayloadSchema` (`lib/shared/schemas.ts:69`): `{limit≤1000,
  batchSize≤5, forceReanalyze}` — kein `ids` (Enrichment-Pendant Z.57 hat `ids`).
- `fetchPublicationsForAnalysis` (`lib/server/analysis/batch.ts:20-47`):
  non-force = View `publication_scoring_candidates`, **force = `where undefined`**
  (Top-N nach `published_at`, inkl. archiviert/ITA/ohne Content!) — der
  gefährlichste Einzelbefund.
- `fetchEventsForAnalysis` (`lib/server/events/analyze.ts:36-52`): non-force =
  View `event_scoring_candidates`, force = alle kommenden Events (harmlos).
- Views: `supabase/migrations/20260716000001_scoring_candidate_views.sql`.
- Modal (`components/scoring-modal.tsx`): ENTITY-Defaults Z.67-88 (Pubs
  sonnet-4/limit 20, Events deepseek/limit 50), POST-Body Z.206, Preisanzeige
  Z.413, Copy Z.75/85/420.
- SSE: `progress`-Frame pro 3er-Batch (`lib/server/llm-batch.ts:114,174`) →
  Cloudflare-100s ist fürs Modal kein Problem; `maxDuration=300` greift nur auf
  Vercel, nicht auf der kanonischen Coolify-Prod.
- Kachel: `lib/server/ingest/status.ts` (Counts aus den Views, eine Query) +
  `app/_components/scoring-status-tile.tsx` (toneFor: danger ab
  `SCORING_STALE_DANGER_DAYS`=7 → wegen Backlog **dauerhaft rot**).
- `getLLMModel` (`lib/server/llm.ts`): Header > `LLM_DEFAULT_MODEL` >
  hartkodiert `anthropic/claude-sonnet-4`.
- Preis-Konsumenten von `LLM_MODELS` (`lib/shared/constants.ts:154`):
  `scoring-modal.tsx:385,413`, `app/social/_components/refresh-button.tsx:350,378`,
  `components/publication-table.tsx:676` (MODEL_SHORT; hat Fallback
  `model.split('/').pop()` — Legacy-Strings brechen nicht).
- In-Chat-Werkzeuge: `scripts/session-pipeline.ts` (robust, Dry-run-Default,
  Score-Guard Z.808, Model-Tag aus `lib/shared/session-model.json`);
  Events-Seite schwächer: `scripts/apply-event-scores.ts` ohne Dry-run/Guard,
  Tag hartkodiert (daher die drei Prod-Varianten).
- Detailseiten (`app/publications/[id]/`, `app/events/[id]/`): keine
  Bewerten-Aktion, kein sichtbares `created_at` (nirgends in der UI).
- Filter-Chip zeigt Rohwert: `app/publications/_components/active-filters.tsx:228`
  („Analyse: pending"). Labels existieren: `STATUS_LABELS`
  (`lib/shared/constants.ts:207`).
- Kein Root-`middleware.ts`; Auth per Route (`requireUser` auf den beiden
  Scoring-Routen). Settings speichern KEIN LLM-Modell (Kommentar B2 in
  `lib/client/stores/settings-store.ts:63`).

---

## 2. Design-Leitplanken (statt separatem Design-Pass)

Bewusste Entscheidung: **kein eigener Claude-Design-/Proposal-Durchlauf.** Alle
UI-Änderungen dieses Plans komponieren bestehende, ausgereifte Muster; ein
Design-Prozess würde nur Neues erfinden, wo „aus einem Guss" gefordert ist:

- **Kachel-Erweiterung (AP3/AP4):** exakt die bestehende Zeilen-Grammatik von
  `scoring-status-tile.tsx` weiterverwenden (Icon-Quadrat, `font-mono text-2xs`
  Sekundärzeile, Pill-Varianten `TONE_PILL`). Neue Elemente nur: gedämpfte
  Altbestand-Angabe (`text-ink-soft`) + Deep-Link (Muster: Social-Kachel mit
  `?theme=`-Deep-Link, Memory `social-deeplink-confetti`).
- **Modal (AP1/AP2):** Struktur unangetastet (Stepper/Metriken/StatusBanner sind
  der Zwilling von `app/social/_components/refresh-button.tsx`). Nur Copy,
  Defaults und die Preiszeile ändern sich.
- **Badges (AP4):** „Neu"-Badge über die bestehenden Varianten in
  `components/ui/badge.tsx` (§2.3-Varianten sind SSOT der Tint/Ink-Klassen),
  keine neuen Klassen-Strings.
- **Verbote:** Em-Dashes in UI-Text (ESLint `no-restricted-syntax`);
  `prefers-reduced-motion` respektieren (Modal tut das bereits via
  `useReducedMotion` — beibehalten).

Falls der User später die Kachel grundsätzlich neu denken will: dann (und nur
dann) der Proposal-Flow wie beim Board (`docs/design/proposals/`).

---

## 3. Arbeitspakete

Reihenfolge = Abhängigkeitsreihenfolge. **AP1–AP3 sind der beauftragte Kern**
(ein Deploy). AP4–AP6 sind beschlossene Folgepakete (je eigener Commit, Deploy
gesammelt sinnvoll). AP7 ist ein Entscheidungspunkt, NICHT bauen ohne Go.

### AP1 — Scoring-Scope: 60-Tage-Fenster + Force-Guardrails

1. **Konstante:** `SCORING_RECENT_DAYS = 60` in `lib/shared/dashboard.ts`
   (neben `SCORING_STALE_DANGER_DAYS`), von Server UND Client importierbar.
2. **Migration** `supabase/migrations/20260721xxxxxx_scoring_rescore_pool.sql`
   (additiv + semantikerhaltend, KEIN Umbau der Kandidaten-Semantik):
   - `CREATE VIEW publication_rescore_pool` = Basis-Prädikat der bisherigen
     Kandidaten-View OHNE die beiden Offen-Bedingungen: `archived=false AND
     enrichment_status IN ('enriched','partial','failed') AND is_ita_subtree=false
     AND Content-Gate >= 120` (Wortlaut aus `20260716000001…` übernehmen).
   - `CREATE OR REPLACE VIEW publication_scoring_candidates AS SELECT * FROM
     publication_rescore_pool WHERE analysis_status IN ('pending','failed') AND
     press_score IS NULL;` → Ergebnisspalten/-zeilen identisch zu vorher
     (verifizieren: Count vorher == nachher, lokal UND prod).
   - COMMENTs auf beiden Views aktualisieren; Rollback im Dateikopf notieren.
3. **`lib/server/analysis/batch.ts`:**
   - non-force: `id IN (SELECT id FROM publication_scoring_candidates) AND
     created_at >= now() - interval '60 days'` (Interval aus der Konstante
     interpolieren, `sql.raw` nur für die geprüfte Zahl).
   - force: `id IN (SELECT id FROM publication_rescore_pool)` + dasselbe
     Zeitfenster. Damit bewertet Force NIE archiviert/ITA/ohne Content und NIE
     außerhalb des Fensters.
   - `orderBy` beide Fälle: `created_at DESC` (statt `published_at`).
   - Kommentar Z.24-28 an die neue Wahrheit anpassen.
4. **`lib/server/events/analyze.ts`:** KEIN Zeitfenster (Kandidatenmenge ist
   durch `event_at >= now()` selbstbegrenzend, aktuell 5). Nur Kommentar
   ergänzen, warum Events bewusst kein Fenster haben.
5. **Modal:** `ENTITY.publications.limit` 20 → **200** (Sicherheitsdeckel, kein
   Scope-Instrument mehr); Copy: Beschreibung + „Bewertet bis zu …"-Zeile →
   „Bewertet neue Publikations-Kandidaten der letzten 60 Tage" (Konstante
   importieren, nicht hardcoden). Events-Copy unverändert.
6. **Akzeptanz:** (a) Kandidaten-View-Count unverändert durch die Migration;
   (b) non-force-Fetch liefert 0 Zeilen mit `created_at` älter 60 Tage;
   (c) force-Fetch liefert 0 archivierte/ITA/Content<120-Zeilen. Für (b)/(c)
   einen kleinen Vitest mit gemocktem db-Layer ODER manuelle SQL-Probe lokal —
   mindestens Letzteres, im Commit-Text dokumentieren.

### AP2 — Opus-Default + kuratierter Picker + dynamische Preise

1. **Defaults:** `ENTITY.*.defaultModel` → `anthropic/claude-opus-4.8` (beide);
   `getLLMModel`-Fallback (`lib/server/llm.ts`) → `anthropic/claude-opus-4.8`;
   `scripts/analyze-events.ts` Fallback (`LLM_DEFAULT_MODEL || …`) ebenso.
   Kommentar in `scoring-modal.tsx:64-66` (Begründung sonnet/deepseek) ersetzen
   durch die neue Begründung (Korpus-Modell, Drift-Messung).
2. **`LLM_MODELS` kuratieren** (`lib/shared/constants.ts:154`):
   - Behalten/Neu: `anthropic/claude-opus-4.8` (tier `recommended`, Beschreibung:
     kalibrierungskonsistent mit dem In-Chat-Korpus), `anthropic/claude-sonnet-5`
     (tier `balanced`), `deepseek/deepseek-chat` (tier `budget`, Beschreibung MUSS
     die Drift benennen: „bewertet deutlich höher als das Opus-kalibrierte
     Korpus (gemessen ~0.53 vs. ~0.25), Scores nicht vergleichbar").
   - Entfernen: `google/gemini-2.0-flash-001` (404), `meta-llama/…:free`
     (kaputtes JSON), `openai/gpt-4o-mini`, `anthropic/claude-3.5-haiku`,
     `anthropic/claude-sonnet-4` (durch sonnet-5 ersetzt). Historische
     `llm_model`-Strings rendern weiter (MODEL_SHORT-Fallback, §1).
   - Preisfeld umbauen: `costPerMillionTokens` → `fallbackPricing: {promptUsd,
     completionUsd}` (Werte aus §1; DeepSeek-Werte beim Bau von der API ablesen).
     `MODEL_COSTS`-Konsumenten prüfen (`grep MODEL_COSTS`) und mitziehen.
3. **Live-Preise, Server-seitig gecached:**
   - Neu `lib/server/llm-pricing.ts`: `getLiveModelPricing(): Promise<Record<
     string, {promptUsd, completionUsd, stale: boolean}>>` — fetcht
     `https://openrouter.ai/api/v1/models` (öffentlich, kein Key), filtert auf
     die `LLM_MODELS`-Values, rechnet auf $/M um. **Modul-Level-Cache mit TTL
     24 h** (kein Next-Cache: läuft identisch auf Vercel UND Coolify-Node).
     Fail-open: bei Fetch-Fehler Fallback-Preise + `stale:true`, Fehler nur
     `log.warn` — Preisanzeige darf nie einen Lauf blockieren.
   - Neu `app/api/llm/models/route.ts` (GET, `withApiError`): liefert die Liste
     gemergt (Metadaten aus `LLM_MODELS` + Live-Preise). Kein `requireUser`
     (gibt nichts aus, verrät nichts Sensibles) — aber Projektkonvention der
     Nachbar-GET-Routen prüfen und folgen.
4. **Client:** `scoring-modal.tsx` und `app/social/_components/refresh-button.tsx`
   laden die Route beim Öffnen des Idle-Zustands (einmal pro Mount reicht;
   AbortController beim Unmount) und rendern `$in / $out je M` statt der bisherigen
   Ein-Zahl-Anzeige; bis zur Antwort bzw. bei Fehler die Fallback-Preise. Kein
   Layout-Umbau (§2).
5. **Akzeptanz:** Modal öffnet mit Opus vorselektiert; Preise erscheinen live
   (Netzwerk-Tab: genau EIN Fetch pro Server-Cache-Fenster); Route offline →
   Fallback-Preise, kein Fehlerzustand im Modal.

### AP3 — Kachel: frisch vs. Altbestand (Zahl == Button-Scope)

1. **`lib/server/ingest/status.ts`:** Pub-Zählungen splitten: `unscoredCount` =
   Kandidaten mit `created_at >= now() - 60 Tage` (Konstante!), NEU
   `backlogCount` = Rest; `oldestUnscoredDays` nur übers frische Fenster.
   Events: `backlogCount: 0` (Interface einheitlich).
2. **`scoring-status-tile.tsx`:** Pill + `toneFor` + Header-Badge rechnen nur
   noch mit frisch; bei `backlogCount > 0` gedämpfte Zusatzangabe
   „+ N Altbestand (nur In-Chat)" in der Sekundärzeile (`text-ink-soft`,
   Grammatik §2). Bewerten-Button disabled bei frisch == 0 (auch wenn Altbestand
   existiert) — der Button kann den Altbestand ja nicht mehr erreichen.
3. **`lib/client/explanations.tsx` `scoring_status`:** Text ergänzen: Button
   bewertet nur Kandidaten der letzten 60 Tage; Altbestand läuft über das
   In-Chat-Scoring. KEINE Em-Dashes. Ggf. Hilfe-Center-MDX (`content/help/…`)
   mitziehen, wenn dort der Bewerten-Knopf beschrieben ist (`grep -r "Bewerten"
   content/help/`).
4. **Akzeptanz:** Kachel zeigt realistisch kleine frische Zahl (aktuell ~7) statt
   2.371; Ampel wird erst rot, wenn FRISCHE Kandidaten ≥7 Tage liegen; Altbestand
   sichtbar, aber ohne Alarm.

### AP4 — Sichtbarkeit: created_at + Deep-Links + Sprach-Politur

1. **Kachel-Deep-Links:** Pub-Zeile → `/publications` mit Analyse-Filter
   „Ausstehend" + Sortierung „Hinzugefügt" (exakte Query-Keys aus
   `app/publications/_filters.ts` ableiten, nicht raten); Events-Zeile →
   `/events?band=unscored`. Muster Social-Kachel (§2).
2. **Publikationen:** Sortierschlüssel `created_at` („Hinzugefügt") in
   `app/publications/_constants.ts` + Server-Mapping (Konsumenten der
   SORT-Konstanten greppen); „Neu"-Badge (created_at ≤ 7 Tage) in Listen-/
   Tabellenzeile, Badge-Variante aus `badge.tsx`.
3. **Detailseiten:** Metazeile „Hinzugefügt am X · Zuletzt geändert Y"
   (Pub-Detail-Header; Event-Detail hat „Synchronisiert:", dort `created_at`
   ergänzen). Datumsformat wie bestehende `Intl.DateTimeFormat('de-AT')`-Nutzung.
4. **Filter-Chip:** `active-filters.tsx:228` → `STATUS_LABELS[filters.analysis]`.
5. **Akzeptanz:** „Was ist neu und unbewertet?" ist in 1 Klick von der Kachel
   beantwortbar; kein roher Statuswert mehr in Chips.

### AP5 — Einzelbewertung (`ids` im Scoring-Payload + Detail-Button)

1. **Schema:** `ids`-Feld (optional, UUID-Regex) in `scoringBatchPayloadSchema`
   — Muster wörtlich vom Enrichment-Schema (`lib/shared/schemas.ts:51-57`).
2. **Fetcher (beide):** bei `ids`: `WHERE id = ANY(ids)` GESCHNITTEN mit den
   Pool-Gates (`publication_rescore_pool` bzw. kommende Events) — Content-/ITA-/
   archived-Schutz gilt IMMER, auch für explizite ids. Kein Zeitfenster bei ids.
   Ohne `forceReanalyze` zusätzlich `press_score IS NULL` (bzw. Event-Pendant);
   mit force darf überschrieben werden. Items, die die Gates ausfiltern, im
   `complete`-Frame als übersprungen ausweisen (sonst wundert sich der Nutzer,
   warum „0 bewertet").
3. **UI:** „Bewerten"-Button auf Pub- und Event-Detailseite; `ScoringModal`
   bekommt optionale Prop `ids?: string[]` (POST-Body ergänzen) + Copy-Variante
   („Diese Publikation bewerten" / „Dieses Event bewerten", Modell-Picker
   bleibt). Run-Lock-409-Handling existiert schon im Modal.
4. **Akzeptanz:** Von einer unbewerteten Detailseite aus ist ein Einzel-Lauf
   möglich; eine archivierte/ITA-Pub liefert „übersprungen", keinen Score.

### AP6 — Events-In-Chat auf session-pipeline-Niveau härten

1. Neu `lib/shared/event-session-model.json` (`{tag, likePattern}`) analog
   `session-model.json` — beendet den Tag-Wildwuchs (drei Varianten in Prod, §1).
2. **`scripts/apply-event-scores.ts`:** Dry-run als Default (`--apply` zum
   Schreiben, `--yes` bleibt fürs Prod-Confirm); Überschreibschutz
   `event_score IS NULL` im UPDATE-WHERE, `--force` zum bewussten Überschreiben;
   Validierung statt `clamp01`-Stille: fehlende/nicht-numerische Dimensionen →
   harter Abbruch mit Item-Liste (Vorbild `session-pipeline.ts cmdApply`).
   Tag aus der neuen JSON.
3. `docs/INCHAT_SCORING.md` aktualisieren (neue Flags, Tag-Quelle).
4. Bewusst NICHT: die Events-Scripts in session-pipeline.ts einschmelzen
   (kleinerer Blast-Radius; kann später kommen).
5. **Akzeptanz:** Zweimaliges `--apply` ist idempotent (zweiter Lauf: alles
   übersprungen); ein Score-Objekt ohne `reach` bricht hart ab.

### AP7 — Backlog-Strategie (NUR Entscheidungsvorlage, nicht bauen)

Optionen für die 2.371 Alt-Kandidaten, dem User vorlegen:
- **A (empfohlen):** On-box-CLI `scripts/analyze-publications.ts` analog
  `analyze-events.ts` (nutzt `runAnalysisBatch`, `--target=prod --limit --model`,
  läuft on-box → Cloudflare irrelevant). Mit Opus 4.8 grob 40–60 $ für alles;
  in Tranchen fahrbar. Braucht explizites Kosten-Go.
- **B:** In-Chat-Kampagnen via `session-pipeline candidates/apply`
  (~24–48 Sessions à 50–100), 0 $, dafür Sessionzeit.
Erst nach User-Entscheidung bauen; das CLI wäre ohnehin AP7-A-Bestandteil.

---

## 4. Verifikation & Deploy (Reihenfolge einhalten)

1. Lokal: `npm run typecheck` && `npm run lint` && `npm run test` (Vitest).
   Migration lokal einspielen und View-Count-Parität prüfen (§AP1.6a).
2. UI-Smoke lokal (`npm run dev`): Modal öffnen (Idle-Zustand reicht — Preise,
   Default, Copy), Kachel-Zahlen. Browser-Tool sparsam (Memory
   `avoid-excessive-browser-tool`); tsc/lint/Tests zuerst.
3. **Prod-Migration:** `npm run db:tunnel` (separates Terminal oder Background)
   + Apply über den Tunnel (node/pg wie `scripts/lib/db.mjs`, `PROD_DB_TUNNEL=1`).
   macOS hat KEIN `timeout` zum Wrappen. Danach Count-Parität auf Prod prüfen.
4. Commit(s) je AP, **nie `git add -A`**.
5. Deploy Vercel: `git push origin main`.
6. Deploy metaspots (kanonische Prod): Worktree `/Users/mleihs/Dev/coolify-wt`,
   main → `chore/coolify-dockerfile` mergen + pushen, dann Trigger on-box:
   `ssh metaspots "curl -s 'http://127.0.0.1:8000/api/v1/deploy?uuid=cbt2tdcwf10ia0prqk8r45bm' -H 'Authorization: Bearer <token>'"`,
   Token in `~/.config/metaspots/coolify-api.token`.
7. Verify auf Prod: Dashboard-Kachel (frische Zahl + Altbestand), Modal-Preise.
   Ein ECHTER Bewertungs-Mini-Lauf (kostet Cents, schreibt Scores) nur nach
   Ansage an den User.
8. Memory aktualisieren (`scoring-split-review-pending.md` → umgesetzt bis AP n).

**Gotchas aus der Memory:** Turbopack frisst `@theme`-Änderungen (`.next`
löschen); Supabase-MCP zeigt auf tote alte Cloud — nie benutzen; Prod-DB nur via
Tunnel (`PROD_DB_TUNNEL=1`, kein `NODE_TLS_REJECT_UNAUTHORIZED=0`); Vercel ist
nur Hot-Standby, metaspots ist die Prod.

---

## 5. Offene Punkte, die der User im Lauf entscheidet

- AP2: DeepSeek im Picker lassen (mit Drift-Warnung, so plant es AP2) oder ganz
  raus? Default: lassen.
- AP5: Modell-Picker bei Einzelbewertung anbieten oder fix Opus? Default: Picker
  lassen (Konsistenz mit Batch-Modal).
- AP7: A oder B, und Kosten-Go.
