# Toolkit-weiter Design-Rollout — Projektplan

Stand: 2026-07-03 · Status: **in Arbeit** · SSOT für diesen Rollout (Checkboxen = Stand).
Design-Spez: [`docs/design/DESIGN_SYSTEM.md`](design/DESIGN_SYSTEM.md) +
Referenz-Mocks in `docs/design/board/*.dc.html` (insb. **`Toolkit-Redesign.dc.html`**
= Dashboard/Publikationen/Events/Kalender in der neuen Sprache).

> **Resume nach Context-Clear:** Dieses Doc + Memory `design-system-direction`
> lesen, die erste offene Checkbox nehmen. Kein Magic-Command — „resume design
> rollout" genügt. Nach JEDER Phase hier abhaken + Memory-Resume aktualisieren,
> damit ein Clear nie Fortschritt verliert.

## Ausgangslage (verifiziert 2026-07-03)

- **Kein Token-Layer vorhanden.** `app/globals.css` hat nur Stock-shadcn-oklch-
  Graustufen + ein einzelnes `--color-brand:#0047bb`. Es gibt **keine**
  `--channel-*`, keine Slate-Neutral-Skala, keine semantischen State-Tokens.
  Die DESIGN_SYSTEM-§8.1-Aussage „Tokens sind schon in globals.css" ist
  **falsch** — sie sind das erste zu bauende Fundament.
- **Board nutzt Inline-Hex überall** (z. B. `#eef1f5`, `#0047bb`, Kanalfarben in
  `app/board/_lib/channels.tsx`), keine Tokens.
- **Icons:** 107 Dateien `lucide-react`, 0 Phosphor. Font Geist/Geist Mono ist
  schon app-weit (layout.tsx).
- Der Redesign berührt ALLE Screens → inkrementell, mit Build-/Browser-Check je
  Phase, kein Big-Bang.

## Phasen

### Phase A — Token-Fundament (globals.css + TS-Spiegel) ✅ (2026-07-03)
Additiv, nicht brechend: neue CSS-Variablen NEBEN den Bestands-shadcn-Tokens.
- [x] A1: ÖAW-Brand-Skala (50–900, 500=`#0047bb`) + Neutral-Rollen (canvas/
      surface/fill/line/ink-*) + semantische States (info/success/warning/
      danger/soon) als CSS-Vars in `:root` (+ `.dark`-Overrides). globals.css.
- [x] A2: Kanal-Akzente (8 Kanäle: accent/tint/text, keyed wie channels.tsx) +
      Score-Skala (8 Stufen) + `scoreColor()` + freie Spalten-Swatch — TS-Modul
      `lib/shared/design-tokens.ts` (BRAND/NEUTRAL/STATE/CHANNEL_ACCENTS/
      SCORE_SCALE). Für programmatische Konsumenten (dynamische Spaltenfarben,
      Score-Bars, Kanvas).
- [x] A3: Elevation-Ebenen als `--shadow-*`-Tokens (card/card-hover/popover/
      modal/btn). Radius-Skala war schon ausreichend (sm=6/xl=14 vorhanden).
- [x] A4: `@theme inline`-Mappings → `bg-brand-500`, `text-ink-subtle`,
      `border-line`, `bg-surface`, `text-danger`, `shadow-card` etc. lösen auf.
      **Verifiziert:** tsc 0, `npm run build` grün, Tokens im kompilierten CSS
      emittiert (light+dark, `--brand-500`/`--n-ink-subtle`-flip/`--state-danger`/
      `--elevation-card`), eslint 0.
- **Kern-shadcn-Tokens NICHT sofort umgepolt** (`--primary`, Neutrals): das
  rippelt über ALLE Screens → eigener verifizierter Sub-Schritt in Phase D.
  Bis dahin sind die neuen Tokens rein additiv (nichts konsumiert sie noch →
  keine visuelle Änderung an Bestands-Screens).

### Phase B — Shared-Komponenten auf Tokens (§8.2) ✅ (2026-07-03)
Leitprinzip (wie Phase A): **kontrollierte, quasi-identische Migration** — neue
semantische Tokens dort konsumieren, wo Light nahezu unverändert bleibt und nur
Dark in die kühle Slate-Richtung kippt. Die riskante *Wert-Umpolung der Kern-
shadcn-Tokens* (`--primary`/Neutrals) + Regressions-Sweep bleibt Phase D.
- [x] Badge (`components/ui/badge.tsx`): Zustand-Varianten (`brand/info/success/
      warning/danger/soon/neutral`). Konsumenten: `due-badge.tsx` **und**
      `card-chip.tsx` (MetaBadge/+N-Pill/Erledigt-Check/Container Inline-Hex →
      `bg-fill`/`text-ink-*`/`text-success`/`bg-surface`/`border-line`/
      `shadow-card`, `ring-card`→`ring-surface`).
- [x] Button (`components/ui/button.tsx`): Primär-Variante trägt jetzt die
      Marken-Elevation `shadow-btn` (§5). Farbtokens bleiben auf shadcn (D-Flip).
- [x] Score-Bar / Score-Badge: **eine geteilte Skala** — `getScoreBandClass`
      (`lib/shared/score-utils.ts` `BAND_CLASSES`) von `amber/orange/neutral-100`
      auf State-Tokens (`bg-warning-tint`/`bg-soon-tint`/`bg-fill`/`bg-brand-500`)
      → jeder `PressScoreBadge`/`ScoreBadge` app-weit on-token + dark-fähig.
      Track `bg-muted`→`bg-fill` (`components/score-bar.tsx`).
- [x] Empty-State: geteilte `components/empty-state.tsx` bereits on-token;
      Border auf `border-line` (Gleichklang mit Card). **Filterleisten-
      Vereinheitlichung → Phase D** (5 feature-eigene Bars, echte Refaktor, s.u.).
- [x] Card/Panel-Container (`components/ui/card.tsx`): `border`→`border-line`,
      `shadow-sm`→`shadow-card`; Radius `rounded-xl`≈14px passt bereits.
- [x] **Enrichment-Status-Badge** (`lib/shared/constants.ts` `STATUS_COLORS`):
      war light-only (in Dark kaputt) → State-Tokens, jetzt dark-fähig.
- **Verifiziert:** tsc 0 · eslint 0 Fehler · vitest 583 · `npm run build` grün ·
  alle konsumierten Utilities im kompilierten CSS emittiert. In-Browser-Check
  ausständig (Chrome-Extension nicht verbunden). **UNCOMMITTED.**
- **Fable-Review des Diffs** (2026-07-03) + Fixes: (1) `transition-[colors,box-shadow]`
  in card-chip war ungültig (`colors` ist keine CSS-Property → Hover-Border
  snappte) → `transition-[border-color,box-shadow]`; (2) **Dark-Mode-Statustext**
  lag auf den dunklen Tints bei ~2:1 (text-info illegibel) → `.dark`-Overrides der
  State-fg-Tokens auf helle Hue-Tints (info=brand-300, success/warning/soon/danger
  hell), jetzt ≥4.5:1 — gilt für alle Tint-Badges + Score-Bänder; (3) Badge-`brand`-
  Variante dark-adaptiert (`dark:bg-brand-900 dark:text-brand-200`). Offen (nit,
  Phase D): Score-`low` leiht sich das `soon`-Token (value-exakt, dokumentiert).

#### Bewusst auf Phase D verschoben (aus dem Ad-hoc-Farb-Audit 2026-07-03)
- **Filterleisten-Vereinheitlichung**: Pubs/Events/Researchers/Social/Board haben
  je eine eigene Bar mit leicht abweichendem Container-Chrome (`<Card>` vs. inline
  `rounded-lg border bg-card p-4`). Nutzen schon Shared-Primitives; echte Ein-
  Muster-Extraktion ist ein Refaktor, kein Token-Swap → mit den Feature-Screens.
- **Kategoriale Identitätsfarben** (KEIN semantischer State, brauchen eine eigene
  Token-Gruppe): `SOURCE_BADGE_CLASSES` (Quelle→Farbe; zudem light-only-Dark-Bug),
  `components/tint-badge.tsx` (farbbenannte Keys), Medaillen-Gold/Silber/Bronze
  (`leaderboard-table`/`spotlight-podium`), Researcher-Kategorie-Palette
  (`beeswarm-view`).
- **Schon dark-fähige Shared-Status-Komponenten** (Konvergenz optional, niedrige
  Priorität, Kontrast-Risiko beim Umstellen): `status-banner.tsx`,
  `decision-badge.tsx`, `similarity-indicator.tsx`, `stat-card.tsx`.
- **Feature-Inline-Status-Farben** (emerald/amber/red über ~15 Screens):
  detail-client, review, orphans-list, main-table, user-management-card, event-
  chip/legend, dashboard-client, enrichment-modal … → Screen-für-Screen in D.

### Phase C — Phosphor-Icon-Umstellung (§8.4, harte globale Umstellung) ✅ (2026-07-03)
- [x] `@phosphor-icons/react` (^2.1.10) als Dependency; **zentrales Mapping-Modul
      `lib/icons.ts`**: bildet alle 138 benutzten lucide-Namen 1:1 auf ihr
      Phosphor-Äquivalent ab und re-exportiert sie unter dem vertrauten Namen
      (+ `LucideIcon`-Typ-Alias → Phosphors `Icon`). Jeder Ziel-Name vor dem
      Schreiben gegen die echten 3024 Phosphor-Exports validiert (0 Fehltreffer).
      **Value-Re-Exports über den SSR/RSC-sicheren Entry** `dist/ssr` — der
      Haupt-Entry legt beim Modul-Load einen `createContext` an, was Server-
      Components (`/_not-found`) den Build bricht; `dist/ssr`-Icons sind context-
      frei und akzeptieren className/size/weight direkt.
- [x] 108 lucide-Aufrufe-Dateien migriert — **reiner Import-Pfad-Swap**
      (`"lucide-react"` → `"@/lib/icons"`), 0 JSX/Prop-Änderungen. Größe bleibt
      erhalten (Tailwind `h-/w-/size-*` überschreibt Phosphors `1em`; verifiziert:
      0 echte bare-Renders — die 5 klassenlosen Icons sitzen in Containern mit
      `[&_svg:not([class*='size-'])]:size-4`, dialog-close + CommandItem).
      `strokeWidth` (26×) = valides SVG-Attribut, von Phosphor visuell ignoriert
      (nutzt `weight`), harmlos. Default-Weight `regular` ≈ lucide-Linienlook.
- [x] lucide-react aus package.json entfernt (0 Referenzen im Source).
- [x] **Phase C+ (User-Wunsch „andere Icons wo passend"):** Sweep ergab nichts
      Passendes — App nutzt bereits durchgängig Icon-Komponenten; die einzigen
      Emoji sitzen in nav.tsx-*Kommentaren* (⚙️/⌘K), keine gerenderten Glyphen;
      Inline-SVGs sind bewusste Brand-/Data-Viz-Assets (capybara-logo, sparkline,
      beeswarm) → nicht angefasst.
- **Verifiziert:** tsc 0 · eslint 0 Fehler (5 pre-existing warnings, unverändert) ·
  `npm run build` grün · vitest 583. In-Browser ausständig (Chrome-Extension
  weiterhin nicht verbunden — wie Vorsession).

### Phase D — Feature-Screens inkrementell (§8.3)
> **Reframing 2026-07-03 (Struktur-Survey):** Die vier Feature-Screens haben
> praktisch KEIN Inline-Hex — sie sind bereits durchgängig über Tailwind-Klassen
> an shadcn/ÖAW-Tokens gebunden; der Kalender ist Schedule-X `theme-default`,
> per `events-calendar.css` auf `--sx-color-* → --card/--primary/--border`
> gebrückt. Score-Bänder zentral in `lib/shared/score-utils.ts`+`constants.ts`.
> ⇒ Der **Kern-Token-Umpolung ist der Haupt-Hebel**: er propagiert automatisch
> in alle vier Screens (inkl. Kalender via Bridge). Screen-„Redesign" = danach
> nur noch gezielte struktur-spezifische Politur, kein Rewrite.
- [x] **Kern-Token-Umpolung (globals.css)** — shadcn-Neutrals von Stock-Grau
      (hue 0) auf ÖAW-Slate umgepolt (mock-exakt = Phase-A-Rohwerte), light+dark:
      `--foreground`→ink, `--muted`/`--secondary`/`--accent`→fill, `--muted-fg`
      →ink-subtle, `--border`→line, `--input`→line-strong, `--primary`→#0047bb;
      `body` → `bg-canvas` (Seite #f7f8fa, Surfaces bleiben weiß). Dark:
      Neutral-Skala+Foregrounds auf ÖAW-Dark; Surfaces/`--primary` unverändert.
      Kontrast geprüft (muted-fg/canvas 4.74:1, ink ≥15:1, primary-text 8:1).
      Verifiziert: tsc0/vitest583/build grün, kompiliertes CSS trägt light+dark
      (`--primary:#0047bb`/`#e5e5e5`, `body{bg var(--n-canvas)}`). **VISUELLER
      Regressions-Sweep über alle Screens NOCH AUSSTÄNDIG** (Chrome-Extension
      nicht verbunden) — der eine unverifizierte Rest dieser Änderung.
- [ ] **Per-Screen-Politur** (struktur-spezifisch, nach Mock; nach Re-Pole nur
      noch Feinschliff): Kalender-Chips · Dashboard-Kachel-Duotone-Icons + Mono-
      Zahlen · Pubs-Zeilen-Score-Layout · Events-Zeilen-Datumsbadge. Braucht
      In-Browser-Check.
- [ ] Board-Politur: Rest-Inline-Hex → Tokens (board-column/card-modal/boards-
      overview/board-switcher/board-avatar; people.ts=User-Avatar-Palette,
      kategorial). `channels.tsx`/`card-chip`/`due-badge` bereits token-basiert.
- [ ] Chart-/Kategorial-Hex sichten (design-tokens.ts als SSOT; beeswarm/
      activity-chart/leaderboard/spotlight; score-bar `#6b7280`-Fallback).
- [ ] Social / Researchers / Settings / Press-Releases visueller Sweep.

### Phase E — Phase-5 MeisterTask-Importer (separater Track, extern blockiert)
- [ ] Read-Client-Schicht + Import-Pipeline + Fixture-Tests. **Blocker:**
      `MEISTERTASK_API_TOKEN` leer → nur fixture-baubar, nicht gegen echte Daten
      verifizierbar. Details: Memory `board-feature-plan` OFFEN #1.

## Verifikation je Phase
`tsc` 0 · `eslint` 0 · `npm run build` grün · volle vitest-Suite · wo möglich
in-Browser (lokaler Dev-Server + Supabase-Stack). Prod-Browser-Check bleibt
durch Egress-402 blockiert (Memory `prod-supabase-free-tier-500mb`).

## Log
- 2026-07-03: Plan erstellt. Design-Recheck: `Toolkit-Redesign.dc.html` in Repo
  geholt, DESIGN_SYSTEM.md §7+Intro aktualisiert. Ausgangslage verifiziert
  (kein Token-Layer, 107 lucide, Inline-Hex im Board).
- 2026-07-03: **Phase A DONE** — Token-Fundament in `app/globals.css`
  (@theme-Mappings + :root/.dark-Rohwerte) + `lib/shared/design-tokens.ts`.
  Additiv/non-breaking, tsc0/build/eslint grün, Tokens im Build-CSS verifiziert.
  **Alles UNCOMMITTED** (Working Tree). Nächste offene Checkbox: Phase B (Badge
  als Referenz-Slice zuerst).
- 2026-07-03: **Phase B DONE** — Shared-Komponenten auf Tokens: Badge-Konsumenten
  (card-chip), Button (`shadow-btn`), Card (`border-line`/`shadow-card`), die
  **geteilte Score-Skala** (`score-utils` BAND_CLASSES + score-bar-Track),
  EmptyState-Border, Enrichment-`STATUS_COLORS` (war dark-kaputt). Kontrollierte,
  quasi-identische Migration (Light unverändert, Dark → Slate). tsc0/eslint0/
  vitest583/build grün; konsumierte Utilities im CSS emittiert; In-Browser
  ausständig (Extension nicht verbunden). Ad-hoc-Farb-Audit (54k-Token Explore)
  → Phase-D-Backlog im Plan dokumentiert (Filterleisten, kategoriale Token-Gruppe,
  Feature-Inline-Farben). **Alles UNCOMMITTED.** Nächste Checkbox: Phase C
  (Phosphor, 107 Dateien) — oder Phase D (Feature-Screens, Kalender zuerst).
- 2026-07-03: **Phase C DONE** — Phosphor-Umstellung via zentralem `lib/icons.ts`
  (138 lucide→Phosphor-Mappings, alle gegen echte Exports validiert; SSR-Entry
  gegen den RSC-`createContext`-Build-Bruch). 108 Dateien reiner Import-Pfad-Swap,
  0 JSX-Änderungen; lucide-react entfernt. Phase C+ („andere Icons") = nichts
  Passendes (nur Kommentar-Emoji + bewusste Brand-/Data-Viz-SVGs). tsc0/eslint0/
  build/vitest583 grün; In-Browser weiter blockiert (Extension nicht verbunden).
  Auf Branch `design/rollout-phase-a-b`. Nächste Checkbox: Phase D (Feature-
  Screens, Kalender zuerst) + Kern-Token-Umpolung.
- 2026-07-03: **Phase D — Kern-Token-Umpolung DONE** (Struktur-Survey ergab: die
  4 Screens sind schon token-gebunden → Re-Pole ist der Haupt-Hebel, kein Screen-
  Rewrite). shadcn-Neutrals in globals.css auf ÖAW-Slate (light+dark), `body`→
  `bg-canvas`, `--primary`→#0047bb. Kontrast-geprüft, tsc0/vitest583/build grün,
  CSS-Emission verifiziert. **VISUELLER Sweep ausständig** (Extension nicht
  verbunden) — das ist der noch unverifizierte Teil. Rest Phase D (Per-Screen-
  Politur, Board-Rest-Hex, Charts) ist Feinschliff auf dem neuen Token-Fundament.
