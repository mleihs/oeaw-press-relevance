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
- [ ] **A2 Docs bereinigen:** Klartext-Credentials durch `<redacted>` ersetzen in
      `docs/PROD_SETUP_PLAN.md:184`, `docs/TECH_HANDOVER.md:167`,
      `docs/RESUME_LOGIN_REDESIGN.md:95-98`, `docs/RESUME_BOARD_MT_PARITAET.md:107`.
      (Historie bleibt schmutzig → bei OSS frisches Repo, siehe Gruppe G.)

### Gruppe B — Typen-/Schema-Split (Fable, in Arbeit 2026-07-06)

- [ ] **B1 `lib/shared/types.ts` (627 Z.) splitten** → `lib/shared/types/` mit
      `index.ts`-Barrel (Import-Pfad `@/lib/shared/types` bleibt gültig):
      `core.ts` (Decision-Tupel, isDecision, Lang, EventLang, ModalStatus, FlagNote),
      `publications.ts` (Publication, PublicationType, PublicationWithRelations,
      ParsedCitation*, PublicationStats, ReviewSession, EnrichmentResult,
      AnalysisResult, LLMResponse), `press-releases.ts`, `people.ts` (Person,
      Orgunit, Project, Lecture, Oestat6, Junctions), `enrichment-events.ts`
      (SSE-/Progress-Event-Typen), `events.ts`, `social.ts`, `users.ts`,
      `settings.ts` (AppSettings + DEFAULT_SETTINGS).
      Interne Abhängigkeiten sind azyklisch (publications → core/press-releases/people).
- [ ] **B2 `lib/server/db/schema.ts` (1094 Z., 49 Tabellen) splitten** →
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

### Gruppe C — Quick Wins Architektur (Opus Medium)

- [ ] **C1** Ungenutzten `Input`-Import entfernen: `app/board/_components/card-modal.tsx:73`.
- [ ] **C2** `eslint-plugin-boundaries` auf v7 + die 7 Legacy-Selektoren in
      `eslint.config.mjs` auf Objekt-Syntax migrieren (Migrationsguide:
      jsboundaries.dev v5-to-v6/v7).
- [ ] **C3** `import 'server-only'` flächendeckend in `lib/server/**` (aktuell
      31/108). Ausnahme prüfen: Module, die von `scripts/` (tsx, außerhalb Next)
      importiert werden, vertragen kein `server-only` → für diese stattdessen
      Kommentar + ggf. eigenes Guard-Muster. Erst Import-Graph der Scripts prüfen!
- [ ] **C4** MeisterTask-Push aus dem Decision-Kern: `lib/server/publications/decisions.ts:4,56`
      → `DecisionSideEffect`-Hook-Interface (z. B. `onDecided(pub, decision)`),
      MT-Push als registrierte Implementierung. Verhalten identisch halten
      (fire-and-forget-Semantik prüfen).
- [ ] **C5** Hardcodes → Env/Config mit Fallback: `lib/server/enrichment/unpaywall.ts:8`
      (Kontakt-Mail), `scripts/match-external-by-title.mjs:44` (private Gmail!),
      `components/auth/auth-screen.tsx:44` (admin@oeaw.ac.at → z. B.
      `NEXT_PUBLIC_ADMIN_CONTACT`). `.env.example` ergänzen.
- [ ] **C6** UI-Konstanten aus Server-Modul: `EVENTS_TAB_VALUES`
      (`lib/server/events/list.ts:10`) + `EVENTS_SORT_VALUES` (:239) nach
      `lib/shared/events-filter.ts`; Importstellen anpassen.

### Gruppe D — Dedup (Opus Medium)

- [ ] **D1** `withBoardAuth`-Wrapper für die 5 identischen Preambles in
      `app/api/board/{cards,columns,items,comments}/[id]/**` (+ labels/watchers/hidden).
- [ ] **D2** Gemeinsame Handler-Factory für `app/api/events/[id]/flag` ↔
      `app/api/publications/[id]/flag` (2 Klone à ~15 Z.).
- [ ] **D3** Geteilte Error-Komponente für `app/{press-releases,publications,researchers}/error.tsx`.
- [ ] **D4** `lib/client/hooks/use-info-bubbles.ts` ↔ `use-keyboard-shortcuts-enabled.ts`
      (29-Z.-Klon) → generischer `useLocalStorageFlag`.
- [ ] **D5** Stats-Klone: `app/api/publications/stats/route.ts` ↔
      `lib/server/dashboard/fetch.ts:36-52,166-177` → gemeinsame Funktion in
      `lib/server/publications/`.
- [ ] **D6** SSE-Batch-Klon (größter, 31 Z.): `lib/server/analysis/batch.ts:134-164`
      ↔ `lib/server/events/analyze.ts:137-165` → gemeinsamer Batch-Loop-Helper.
- [ ] **D7** Query-Logik aus Report-Routen in Feature-Module:
      `app/api/dev/switch-user`, `app/api/export/csv`, `app/api/webdb/status`,
      `app/api/publications/[id]/similar-pressed`.

### Gruppe E — Design-System-Fixes ohne visuelles Risiko (Opus Medium)

- [ ] **E1** `components/ui/virtualized-multi-select.tsx` Z.193-318: neutral-Grauskala
      → semantische Tokens (muted/border/foreground); einzige Grauskala-Datei im
      ui-Kit, in Dark kaputt. Konsumenten: publications/filter-sheet, social-toolbar.
- [ ] **E2** `SOURCE_BADGE_CLASSES` (`lib/shared/constants.ts:124-132`) dark-fähig
      (dokumentierter offener Dark-Bug, siehe DESIGN_ROLLOUT.md).
- [ ] **E3** Wert-identische Ersetzungen (0 visuelle Änderung):
      `app/_components/dashboard-client.tsx:512,580` `bg-[#fdeaea]` → `bg-danger-tint`;
      `components/changelog-panel.tsx:165-244` `rgba(0,71,187,…)` →
      `var(--brand-500)`/color-mix.

### Gruppe F — Design-Pass mit Browser-Verify (Opus, eigene Session)

- [ ] **F1 Type-Scale einführen.** Definition (verbindlich, in `app/globals.css`
      als `@theme`-Tokens):
      | Token | px | ersetzt |
      |---|---|---|
      | `text-3xs` | 9px/12px | `text-[9px]`, `text-[9.5px]` |
      | `text-2xs` | 10px/14px | `text-[10px]`, `text-[10.5px]`, `text-[11px]` (Labels) |
      | `text-xs` (Tailwind) | 12px | `text-[11.5px]`, `text-[12px]`, `text-[12.5px]` |
      | `text-sm` (Tailwind) | 14px | `text-[13px]`, `text-[13.5px]` |
      Sweep screen-weise (337 Stellen), pro Screen visueller Check (Playwright-Login
      via API, nicht Klick-Flow!). Halbe Pixel auf die nächste Stufe runden.
- [ ] **F2** `components/auth/auth-screen.tsx`: 65 Hex-Stellen sind 1:1-Duplikate
      existierender Tokens (`#f7f8fa`=--n-canvas, `#16202e`=--n-ink, …) → auf
      Tokens umstellen (bewusste Form-Abweichung 46px-Felder bleibt).
- [ ] **F3** Die restlichen der 88 light-only-Palette-Stellen dark-fähig machen
      (enrichment-modal, user-management-card, review/page, detail-client, …).
- [ ] **F4** (optional) `decision-badge`/`tint-badge` auf State-Tokens mappen
      (green→success, blue→info); kategoriale Token-Gruppe lt. DESIGN_ROLLOUT.md.

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
