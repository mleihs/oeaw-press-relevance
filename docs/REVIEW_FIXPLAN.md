# Review-Fixplan (Code-Review 2026-07-06)

Arbeitsgrundlage für die Abarbeitung der Code-Review-Funde. Die Review lief mit
Fable (4 parallele Analysen: Architektur/Zerlegung, Design-System, OSS-Readiness,
eigene Checks für Duplikate/Gates). Dieser Plan ist die Spec für Folge-Sessions —
**pro Session eine Gruppe abarbeiten, danach Gates laufen lassen** (siehe unten).

## Resume (nach Context-Clear / neue Session)

> Lies docs/REVIEW_FIXPLAN.md und arbeite die nächste offene Aufgabengruppe ab
> (Checkboxen unten, Reihenfolge einhalten). Nach jeder Gruppe:
> `npm run typecheck && npm test && npm run lint && npm run check-schema-drift`.
> Committe pro Gruppe mit beschreibender Message. Keine visuellen Änderungen
> außer wo explizit vorgesehen (Gruppe F mit Browser-Verify).

## ⚠️ Working-Tree-Hinweis (Stand 2026-07-06)

Im Working Tree liegt **uncommittete parallele Arbeit** (Board-MT-Parität:
emoji-picker, mention-textarea, due-date-picker, attachment-preview,
lib/icons.ts, package.json u. a. — siehe docs/RESUME_BOARD_MT_PARITAET.md).
**Nicht anfassen und nicht mitcommitten** — beim Committen immer gezielt
`git add <pfad>` der eigenen Änderungen, nie `git add -A` auf Repo-Ebene.

## Gates (nach jeder Gruppe)

```
npm run typecheck   # fumadocs-mdx && tsc --noEmit
npm test            # vitest, 615+ Tests, muss grün bleiben
npm run lint        # 0 Fehler erwartet
npm run check-schema-drift
```

Vor dem finalen Push zusätzlich `npm run build`.

## Ausgangslage (Review-Ergebnis, Kurzfassung)

Gesamtzustand sehr gut: Schichtgrenzen real + lint-erzwungen (eslint-plugin-boundaries),
keine Zyklen, 0 `as any` / 0 `@ts-ignore`, 615 Tests grün, 0,54 % Duplikate,
Dependencies aktuell. Schulden sind konzentriert: drei zentrale Kopplungsdateien
(`lib/shared/types.ts`, `lib/server/db/schema.ts`, MeisterTask-Push im Decision-Kern),
fehlende Typografie-Skala, Credentials in Docs (OSS-Blocker).

---

## Aufgabengruppen

### Gruppe A — Sofort / Sicherheit

- [ ] **A1 Credentials rotieren (NUR USER):** Passwort des Kontos
      `matthias.leihs@oeaw.ac.at` ändern; Test-User `authtest.tmp@oeaw.ac.at`
      löschen; prüfen ob das historische Gate-Passwort noch irgendwo aktiv ist.
- [x] **A2 Docs bereinigen (DONE, Commit c858515 + RESUME_BOARD in Board-Commit):**
      Klartext-Credentials durch `<redacted>` ersetzt in `docs/PROD_SETUP_PLAN.md`
      (GATE_PASSWORD/GATE_TOKEN/MEISTERTASK_API_TOKEN), `docs/TECH_HANDOVER.md`,
      `docs/RESUME_LOGIN_REDESIGN.md`, `docs/RESUME_BOARD_MT_PARITAET.md`,
      `docs/RESUME_SOCIAL_REDESIGN.md`. (Historie bleibt schmutzig → bei OSS
      frisches Repo, siehe Gruppe G.)

### Gruppe B — Typen-/Schema-Split (Fable, ERLEDIGT 2026-07-06)

- [x] **B1 `lib/shared/types.ts` (627 Z.) splitten** → `lib/shared/types/` mit
      `index.ts`-Barrel (Import-Pfad `@/lib/shared/types` bleibt gültig):
      `core.ts` (Decision-Tupel, isDecision, Lang, EventLang, ModalStatus, FlagNote),
      `publications.ts` (Publication, PublicationType, PublicationWithRelations,
      ParsedCitation*, PublicationStats, ReviewSession, EnrichmentResult,
      AnalysisResult, LLMResponse), `press-releases.ts`, `people.ts` (Person,
      Orgunit, Project, Lecture, Oestat6, Junctions), `enrichment-events.ts`
      (SSE-/Progress-Event-Typen), `events.ts`, `social.ts`, `users.ts`,
      `settings.ts` (AppSettings + DEFAULT_SETTINGS).
      Interne Abhängigkeiten sind azyklisch (publications → core/press-releases/people).
- [x] **B2 `lib/server/db/schema.ts` (1094 Z., 49 Tabellen) splitten** →
      `lib/server/db/schema/` mit `index.ts`-Barrel: `auth.ts` (users,
      user_settings), `webdb.ts` (persons/orgunits/extunits/projects/lectures +
      Typ-Lookups + Junctions), `publications.ts` (+ embeddings, centroid,
      review_sessions, Views), `press-releases.ts`, `events.ts`, `social.ts`,
      `board.ts`, `smart-objects.ts` (external_objects, card_references).
      **Mitziehen:** `scripts/check-schema-drift.mjs` (greppt pgTable in der
      Einzeldatei → auf Verzeichnis-Scan umstellen) und `drizzle.config.ts`
      (`schema: './lib/server/db/schema.ts'` → Glob/Index). `relations.ts`
      importiert aus `./schema` — Barrel hält das stabil.
      Cross-Domain-FKs (cards→events/publications, press_releases→publications)
      sind Einbahnstraßen, kein Zyklus.
- [ ] **B3 (Folge, Opus):** Importstellen schrittweise vom Barrel auf die
      Feature-Dateien umziehen (mechanisch; nur nötig für den echten Paketschnitt,
      nicht für die Whole-App-OSS-Variante).

### Gruppe C — Quick Wins Architektur (Opus Medium) — DONE (C1–C6; C2 Commit s. u.)

- [x] **C1 (hinfällig)** Der ungenutzte `Input`-Import in card-modal.tsx war durch
      die parallele Board-Arbeit bereits entfernt — nichts zu tun.
- [x] **C2 (DONE, 2026-07-06)** `eslint-plugin-boundaries` 6.0.2 → 7.0.1 gebumpt
      und die 7 Legacy-Selektoren in `eslint.config.mjs` auf Objekt-Syntax
      migriert. v7 benennt zusätzlich `rules` → `policies` um; beide Warnungen
      (legacy-Selektor + `rules`-Deprecation) sind jetzt still. Neue Form:
      `from: { element: { type } }` / `allow: { to: { element: { types: [...] } } }`.
      Enforcement empirisch verifiziert (Probe-Datei `lib/client → lib/server`
      wird weiterhin als Error gefangen). Lint jetzt 0 Warnungen / 0 Fehler.
- [x] **C3 (DONE)** `import 'server-only'` auf 25 weitere `lib/server/**`-Module
      (jetzt 54/117). Ausgeschlossen: die 64 script-erreichbaren Module (transitiver
      Import-Graph ab `scripts/` berechnet — tsx/Node wirft bei `server-only`).
      Kein `use client`-Consumer importiert eines der 25 (statisch verifiziert,
      inkl. Relativpfade) → build-safe. Per-Datei-Kommentar an den Ausnahmen
      bewusst weggelassen (Rauschen); Rationale im Commit + hier.
- [x] **C4 (DONE)** MeisterTask-Push aus dem Decision-Kern gelöst →
      `DecisionSideEffect`-Hook in `lib/server/publications/decision-side-effects.ts`,
      MT-Push als registrierte Implementierung. `decisions.ts` importiert kein
      `meistertask/push` mehr; JSON-Contract `{ publication, meistertask }`
      unverändert. Verhalten identisch (sequenziell, awaited, non-pitch → null).
- [x] **C5 (DONE)** Hardcodes → Env/Config mit Fallback: `unpaywall.ts` +
      `match-external-by-title.mjs` (privates Gmail raus) via `API_CONTACT_EMAIL`;
      `auth-screen.tsx` via `NEXT_PUBLIC_ADMIN_CONTACT`. `.env.example` ergänzt.
- [x] **C6 (DONE)** `EVENTS_TAB_VALUES` + `EVENTS_SORT_VALUES` (samt Validatoren,
      Typen und `DEFAULT_EVENTS_SORT`) aus `events/list.ts` nach
      `lib/shared/events-filter.ts` verschoben; alle Importstellen umgezogen.

### Gruppe D — Dedup (Opus Medium) — DONE 2026-07-06

- [x] **D1** `withBoardErrors`-HOF (statt des geplanten `withBoardAuth` — die
      echte Duplikation war die 6-Zeilen-`boardErrorToResponse`-try/catch, nicht
      die requireUser-Preamble; ein Auth-Wrapper hätte die variierenden
      Handler-Signaturen erzwungen). In `lib/server/board/errors-http.ts`, per
      Barrel exportiert. 25 Board-Routen / 30 Handler auf
      `withApiError(withBoardErrors(async …))` umgestellt, try/catch entfernt.
      Bewusst NICHT umgestellt: `attachments/[id]` GET (scoped mid-function catch,
      kein mechanisches Match) — behält `boardErrorToResponse`.
- [x] **D2** `createFlagRoute(deps)`-Factory in `lib/server/flag-route.ts`; beide
      Flag-Routen (events/publications) sind jetzt 10-Zeilen-`export const
      { POST, DELETE } = createFlagRoute({ setFlag, clearFlag, isNotFound })`.
- [x] **D3** `components/route-error.tsx` (`RouteError`); die drei list-page
      `error.tsx` sind dünne Wrapper.
- [x] **D4** `makeLocalStorageFlag(key, eventName)` in
      `lib/client/hooks/use-local-storage-flag.ts`; beide Hooks delegieren
      (keyboard-Hook exportiert zusätzlich `read` als imperativen Reader).
- [x] **D5** `fetchPublicationDashboardStats(defaultEligible)` +
      `PublicationDashboardStats` in `lib/server/publications/dashboard-stats.ts`;
      stats-Route + dashboard/fetch nutzen es (Dashboard = Basis + similarity_distribution).
- [x] **D6** `sseBatchHooks(emit)` + `emitBatchComplete(emit, result)` in
      `lib/server/llm-batch.ts`; analysis/batch + events/analyze nutzen sie.
- [x] **D7** Query-Logik in Feature-Module: `lib/server/webdb/status.ts`
      (`getWebdbStatus`), `lib/server/publications/similar-pressed.ts`
      (`getSimilarPressed`), `lib/server/publications/export.ts`
      (`fetchAnalyzedExportRows`), `lib/server/auth/user-switcher.ts`
      (`authorizeUserSwitch` + `listSwitchableUsers`). Die vier Routen sind jetzt
      dünne HTTP-Adapter (CSV-Formatierung + switch-user-Session-Cookie-Flow
      bleiben request/response-gebunden in der Route).

### Gruppe E — Design-System-Fixes ohne visuelles Risiko (Opus Medium) — DONE 2026-07-06 (E3-Changelog → F verschoben)

- [x] **E1** `components/ui/virtualized-multi-select.tsx`: neutral-Grauskala →
      semantische Tokens. `text-neutral-500`→`text-muted-foreground`,
      `hover:text-neutral-900`→`hover:text-foreground`, GroupHeader
      `bg-neutral-50 border-neutral-100`→`bg-muted border-border`, RowItem
      `hover:bg-neutral-100`+`bg-neutral-50(checked)`→`hover:bg-accent`+`bg-accent`
      (command.tsx-Idiom), Checkbox-off `border-neutral-300 bg-white`→
      `border-input bg-background`. Brand-Fill (checked) unverändert.
- [x] **E2** `SOURCE_BADGE_CLASSES` (`lib/shared/constants.ts`) dark-fähig — je
      Quelle additiv `dark:bg-<c>-500/15 dark:text-<c>-300` (tint-badge-Konvention);
      Light 1:1 unverändert.
- [x] **E3 (Teil)** `app/_components/dashboard-client.tsx` (2×) `bg-[#fdeaea]` →
      `bg-danger-tint` (Token = #fdeaea light / #331515 dark → light-identisch,
      dark-gefixt).
- [ ] **E3 (Rest) → verschoben nach F:** `components/changelog-panel.tsx`
      `rgba(0,71,187,…)`-Schatten → `color-mix(in srgb, var(--brand-500) …%, transparent)`.
      Grund: color-mix in Tailwind-Arbitrary-`shadow-[…]` ist im Repo bisher
      NICHT verwendet; unparsbare Arbitrary-Values verwirft Tailwind still
      (→ Schatten verschwindet, unsichtbare Regression). Braucht Browser-Verify
      → gehört zu Gruppe F, nicht in den „ohne visuelles Risiko"-Schnitt.

### Gruppe F — Design-Pass mit Browser-Verify (Opus, eigene Session) — DONE 2026-07-06

- [x] **F1 Type-Scale (DONE, Commit ef0db10).** `text-3xs` (9px/12px) +
      `text-2xs` (10px/14px) als `@theme`-Tokens; Sweep aller 330 Stellen
      (87 Dateien) lt. Tabelle: 9/9.5→3xs, 10/10.5/11→2xs, 11.5/12/12.5→xs,
      13/13.5→sm. Alle Screens in Chrome gegengeprüft (Dashboard, Pubs+Detail,
      Events Liste/Kalender/Modal/Detail, Board+Karten-Modal, Social, PRs,
      Researchers+Beeswarm, Person, Settings, Review, Login, ⌘K).
      **Gotcha:** Turbopack-Persistent-Cache überlebt Dev-Server-Restarts und
      serviert stale `@theme`-Builds → bei Token-Änderungen `.next` löschen.
      Bewusst NICHT angefasst: text-[14px+] (keine Skalen-Stufe definiert).
- [x] **F2 (DONE, Commit f2cd4a2).** auth-screen: 23 exakte Token-Duplikate +
      3 Nächste-Nachbarn auf Tokens; auth-field/auth-btn-primary auf var()/
      color-mix. Neu `.force-light` (globals.css): die ÖAW-Rohwerte-Sektion
      hängt an `:root, .force-light` (SSOT) — der Screen bleibt auch bei
      html.dark 1:1 light (in-Browser mit erzwungenem dark verifiziert).
      Bewusst behalten: Amber-Papier-Palette, #9cc0ff-Dekor, 46px-Feldform.
- [x] **F3 (DONE, Commit 305421a).** Die tatsächlich brechenden Stellen waren
      konzentriert (viele Dateien hatten schon dark:-Varianten): celebration-
      Banner, board-management-Löschwarnung, assign-button, card-modal-
      Abschließen-Buttons, enrichment-modal, user-management-Icons, review-
      Icons, publication-table-Indikatoren, references-section. dark
      in-Browser + Playwright-Fullpage (review, press-releases) verifiziert.
      Mid-tone-500er-Akzente bewusst ohne dark:-Variante (lesbar auf dark).
- [x] **F4 (DONE, Commit 72185bd).** DECISION_VARIANTS auf State-Tokens
      (pitch→success, hold→info=ÖAW-Blau), dark-Lifts emerald-300/brand-300;
      Kalender-Legende + Event-Chips mitgezogen. `tint-badge` bewusst NICHT
      gemappt — kategoriale Identitätsfarben (DESIGN_ROLLOUT.md), als
      Kommentar in der Datei dokumentiert.
- [x] **F5 (DONE, Commit 57ce4a8).** changelog-panel: alle 6 rgba(0,71,187,α)-
      Schatten → `color-mix(in_srgb,var(--brand-500)_α%,transparent)`;
      Tailwind generiert die Utility (mit @supports-Guard), computed-Style
      im Browser wert-identisch bestätigt. Hinweis: ChangelogPanel ist seit
      dem Toolkit-Redesign (c532111) ohne Consumer — geparkter Code.

**Nebenfunde am Weg (2026-07-06):** `app/api/researchers/{top,distribution}`
lieferten PG numeric/bigint als String (TS-Typ log) → Verteilungs-Ansicht
crashte (`metric_value.toFixed`), Rangliste latent bei sum_score. Fix:
Koerzierung an der API-Boundary (Commit 7c072fb).

### Gruppe G — OSS-Track (eigene Planung, nicht „Fixes")

- Orgunits/ÖSTAT-6 generalisieren; Pure-Citation-Parser als optionales Plugin;
  LLM-Prompt-Profil (Institution/Medien/Sprache) als Config statt hardcoded
  (`lib/server/analysis/prompts.ts`).
- i18n der deutschen UI; Sample-Dataset; Auth-Story dokumentieren (Gate vs.
  Supabase-Auth — Publications-Mutationen prüfen heute keine Identität).
- **Veröffentlichung nur als frisches Repo (kuratierter Export)** — die Historie
  enthält Credentials und interne Ops-Docs. `docs/` trennen: nur SELF_HOSTING,
  ARCHITECTURE, TESTING, ADRs mitnehmen. PII in `docs/design/**.dc.html`
  (echte @oeaw.ac.at-Namen) anonymisieren. `public/release/` raus.
  `"license": "MIT"` in package.json ergänzen.
- Empfohlene Variante: Whole-App-Release („StoryScout") **minus** board/social/
  meistertask (Server-Inseln, billig herauszuschneiden: `app/page.tsx`,
  `app/events/page.tsx:16`, `create-card-button`, MT-Spalten im Schema) statt
  Paket-Extraktion. Details im Architektur-Teil des Review-Berichts
  (Session 2026-07-06) und in OSS_READINESS_PLAN.md.

## Bewusst NICHT geplant

- Kein Bump von temporal-polyfill 1.0 / eslint 10 / react-day-picker 10
  (pending Upstream, siehe Memory/AUDIT_REMEDIATION_PLAN).
- `lib/client/explanations.tsx` (2101 Z.) bleibt — deklaratives Text-Register,
  keine Logik, Split brächte nichts.
- Die 42 binding-losen `catch {`-Blöcke sind geprüfte Best-Effort-Fallbacks
  (localStorage/JSON-Parse/Realtime) — kein Handlungsbedarf.
