# Design System — ÖAW Press Toolkit

Stand: 2026-07-03 · Status: **verbindliche Richtung (mittelfristig toolkit-weit)**

Dieses Dokument fasst das **Design Book** (`docs/design/board/Designsystem.dc.html`
+ die Board-Screens) als toolkit-weite Spezifikation zusammen. Es entstand für
das Redaktionsboard, gilt aber ab jetzt als **die** Designsprache für das
gesamte Press-Toolkit. Neue Oberflächen bauen direkt danach; die Bestands-
Screens (Dashboard, Publikationen, Events, Triage, Social, …) werden
**inkrementell** angeglichen, nicht in einem Rutsch (§8 Rollout).

> **Toolkit-weite Referenz (neu, 2026-07-03):** `docs/design/board/Toolkit-Redesign.dc.html`
> zeigt die Designsprache erstmals **auf die Nicht-Board-Screens angewandt** —
> Dashboard (Redaktionsboard-Kachel + Triage/PM-Kacheln + Stat-Reihe + Top-Storys
> + Score-Verteilung/Dimensions-Balken/Keywords), Publikationen (Filterleiste +
> Score-Zeilen-Liste), Veranstaltungen als **Tabelle UND neu gestylter
> Schedule-X-Kalender** (Monat/Woche) inkl. Event-Cockpit-Modal. Tokens sind
> identisch zu diesem Doc; das Mock ist die verbindliche Vorlage für die
> §8-Angleichung dieser Screens. Es verwendet durchgängig **Phosphor-Icons**
> (§7) und **Geist/Geist Mono** (bereits app-weit geladen).

> Single Source of Truth für Tokens: die CSS-Variablen in `app/globals.css`
> (`--brand-*`, `--channel-*`, semantische Zustände). Dieses Dokument ist die
> lesbare Fassung + die Begründungen; bei Abweichung gewinnt `globals.css`.

---

## 1. Prinzipien

1. **Ruhiges, kühles Slate-Neutral + ÖAW-Blau als einzige Marke.** Farbe ist
   Information, nicht Dekoration: Akzentfarben markieren Kanäle/Status, nie
   Flächen „zur Auflockerung".
2. **Mono für Zahlen/Meta, Sans für Text.** Zähler, Kürzel, Daten, IDs,
   Score-Werte laufen in einer Monospace; Fließtext/Labels in der UI-Sans.
3. **Weiche Elevation statt harter Ränder.** Tiefe kommt aus abgestuften
   Schatten (§5), Trennung aus 1px-Slate-Bordern — nie beides doppelt.
4. **Radius-Rhythmus 6 / 10 / 14 / pill.** Klein→Boxen, mittel→Karten,
   groß→Panels/Modals, pill→Avatare/Chips.
5. **Zustände sind farbcodiert und konsistent** (Info/Erfolg/Warnung/Fehler +
   die Fälligkeits-Sonderfälle overdue/soon), quer über alle Features gleich.

---

## 2. Farb-Tokens

### 2.1 Marke — ÖAW-Blau (`--brand-*`, 500 = `#0047bb`)
| 50 | 100 | 200 | 300 | 400 | **500** | 600 | 700 | 800 | 900 |
|---|---|---|---|---|---|---|---|---|---|
| `#eef4ff` | `#dbe7ff` | `#b8ccff` | `#85a6ff` | `#4b78ee` | **`#0047bb`** | `#003ea3` | `#00337f` | `#0a2a60` | `#0d2450` |

Nav-Bar-BG = 500. Aktiv-Pill auf der Bar = `white/20`. Link-Chip-BG = 50.
Selektion (`::selection`) = `#cfe0ff`.

### 2.2 Neutral (kühl getöntes Slate)
| Rolle | Hex |
|---|---|
| App-BG | `#f7f8fa` |
| Fläche/Track (100) | `#eef1f5` |
| Segment-BG | `#f1f3f6` |
| Border (200) | `#e2e6ec` |
| Border kräftig (300) | `#cbd2dc` |
| Muted-Text / Placeholder (400) | `#9aa4b2` |
| Sekundärtext (500) | `#64707f` |
| Text (600) | `#475262` |
| Text kräftig (700) | `#333d4c` |
| Überschrift (800) | `#212b38` |
| Body-FG | `#16202e` |
| Panel-BG (Modal-Sidebar) | `#fbfcfd` |

### 2.3 Semantische Zustände
| Status | Text/Icon | Tint-BG | Border |
|---|---|---|---|
| Info | `#0047bb` | `#eef4ff` | — |
| Erfolg / Erledigt | `#059669` | `#e7f7ef` | — |
| Warnung | `#d97706` (Text `#92620c`) | `#fdf1e3` | `#f4dcb8` |
| Fehler / Überfällig | `#dc2626` | `#fdeaea` | `#f4c4c4` |
| Fällig „bald" (soon, ≤3 Tage) | `#c2410c` | `#fdeee3` | — |

### 2.4 Kanal-Akzente (8 Ausspielkanäle)
Jeder Kanal trägt `accent` (solid: Linksrand/Punkt/Icon), `tint` (Modal-Header/
Kartengrund), `text` (dunkler Kanaltext auf Tint). Für das Board sind die
Spaltennamen die Keys des Name→Icon/Farbe-Mappings.

| Kanal | accent | tint | text |
|---|---|---|---|
| PM/Presse | `#2563eb` | `#eaf1ff` | `#1e3a8a` |
| Web | `#0d9488` | `#e6f7f4` | `#0f766e` |
| Blog GÖ | `#7c3aed` | `#f2ecff` | `#6d28d9` |
| Podcast | `#c026d3` | `#fbeafc` | `#a21caf` |
| Events | `#ea580c` | `#fdeee3` | `#c2410c` |
| Screens | `#16a34a` | `#e7f7ec` | `#15803d` |
| Science Pop | `#e11d48` | `#fdeaef` | `#be123c` |
| Zeitlos | `#64748b` | `#eef1f5` | `#475569` |

Freie Spaltenfarben (Board-Verwaltung, 10er-Swatch):
`#2563eb #0d9488 #7c3aed #c026d3 #ea580c #16a34a #e11d48 #64748b #0891b2 #d97706`.

### 2.5 Score-/Relevanz-Skala (0→100 %, Neutral→Marke, 8 Stufen)
`#cbd2dc #9aa4b2 #fbc98a #f59e42 #e88a2a #6b93e6 #2f6ad0 #0047bb`.
Deckt Press-Score, Event-Score etc. ab (ersetzt mittelfristig die
feature-eigenen Score-Skalen).

---

## 3. Typografie

- **Sans (UI/Text):** Geist als Ziel; bis zum toolkit-weiten Font-Rollout ist
  der bestehende System-/Sans-Stack akzeptabel (§7).
- **Mono (Zahlen/Meta/IDs/Daten):** Geist Mono als Ziel.

Größen (px): Nav-Links 13.5 · Board-/Panel-Titel 15–16 · Karten-/Zeilentitel
**13.5/600, lh 1.35** · Meta-Badges **11** · Zähler-Pills 11.5 · Modal-Titel
**21/700, -0.01em** · Section-Header 13.5/600 · Fließtext 13–13.5, lh 1.5–1.55 ·
Meta-Labels UPPERCASE Mono 10–10.5, ls .08em · Buttons 13/600.

---

## 4. Spacing & Maße (Referenz aus den Board-Screens)

Nav-Höhe 54 · Toolbar 58 · Filterleiste 54. Board: Spaltenbreite 296,
Spalten-Gap 14, Karten-Gap 9, Karten-Padding `12/13`, People-Bar 80 (eingeklappt
38). Modal max-width 840, Sidebar 248. Grid-Übersicht `repeat(3,1fr)`, Gap 16,
max-width 1160.

## 5. Elevation

| Ebene | box-shadow |
|---|---|
| 1 · Karte | `0 1px 2px rgba(16,32,46,.05)` |
| Karte-Hover | `0 5px 16px rgba(16,32,46,.13)` |
| 2 · Popover | `0 6px 16px rgba(16,32,46,.10)` |
| 3 · Modal | `0 24px 60px rgba(13,36,80,.32)` |
| Overlay | `rgba(13,36,80,.42)` + `backdrop-filter: blur(2px)` |
| Primärbutton | `0 1px 2px rgba(0,71,187,.3)` |

## 6. Radius

`6` (Boxen/Badges) · `10` (Karten/Inputs) · `14` (Cards/Panels) · `16` (Modals) ·
`999px` (Pills/Avatare).

---

## 7. Icons

Das Design Book nutzt **Phosphor Icons** — und die neue toolkit-weite Referenz
(`Toolkit-Redesign.dc.html`) bestätigt das jetzt durchgängig über alle
Screens (Dashboard/Publikationen/Events/Kalender), inkl. der duotone-Varianten
für Kachel-Glyphen. Der Bestand nutzt **lucide-react** (Stand 2026-07-03: 107
Dateien lucide, 0 Phosphor). Der Icon-Wechsel bleibt die eine noch offene
**harte globale Umstellung** (§8.4): eine neue Dependency + ein fokussierter
Pass über alle Icon-Aufrufe — separat zu entscheiden, nicht verstreut. Bis
dahin gilt die Mapping-Tabelle unten; das Board wurde bewusst noch auf lucide
gebaut (siehe Memory `board-feature-plan`).

| Bedeutung | Phosphor | lucide (Fallback) |
|---|---|---|
| Board | `ph-kanban` | `LayoutDashboard` / `Trello` |
| Suche | `ph-magnifying-glass` | `Search` |
| Filter | `ph-funnel` | `Filter` |
| Checkliste | `ph-list-checks` | `ListChecks` |
| Erledigt | `ph-check-circle` | `CheckCircle2` |
| Fällig | `ph-clock` | `Clock` |
| Überfällig | `ph-clock-countdown` | `AlarmClock` |
| Anhang | `ph-paperclip` | `Paperclip` |
| Kommentar | `ph-chat-circle` | `MessageCircle` |
| Beobachter | `ph-eye` | `Eye` |
| Verschieben | `ph-arrow-line-right` | `ArrowRightToLine` |
| Unteraufgabe | `ph-list-bullets` | `ListTree` |
| ÖAW-Link | `ph-link-simple` | `Link` |
| Triage | `ph-lightning` | `Zap` |
| Umwandeln | `ph-arrow-square-out` | `ExternalLink` / `SquareArrowOutUpRight` |

**Kanal→Icon** (Phosphor / lucide-Fallback):
PM/Presse `ph-megaphone-simple`/`Megaphone` · Web `ph-globe-hemisphere-west`/`Globe` ·
Blog GÖ `ph-pen-nib`/`PenTool` · Podcast `ph-microphone-stage`/`Mic` ·
Events `ph-calendar-star`/`CalendarStar (→ Calendar)` · Screens `ph-monitor`/`Monitor` ·
Science Pop `ph-sparkle`/`Sparkles` · Zeitlos `ph-archive`/`Archive`.

---

## 8. Rollout-Strategie (toolkit-weit)

1. **Board = Referenzimplementierung** (Phase 2): erster Screen komplett nach
   diesem System. Tokens landen als CSS-Variablen in `app/globals.css`, damit
   sie ab sofort überall verfügbar sind.
2. **Shared-Komponenten zuerst angleichen:** Badges, Buttons, Score-Bars,
   Empty-States, Filterleisten — dort schlägt eine Token-Umstellung breit durch.
3. **Feature-Screens inkrementell** bei ohnehin anstehenden Änderungen mitziehen
   (kein Big-Bang-Refactor; Adoption-/Regressionsrisiko klein halten).
4. **Font + Icon-Library** sind die einzigen „harten" Umstellungen (globale
   Dependency/Asset-Entscheidung) — separat entscheiden und dann in einem
   fokussierten Pass umstellen, nicht verstreut.
