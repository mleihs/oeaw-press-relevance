# Toolkit-Redesign Rollout — Resume/Handoff

**Ziel:** Views **Dashboard**, **Publikationen**, **Veranstaltungen** gemäß dem
verbindlichen Entwurf `docs/design/board/Toolkit-Redesign.dc.html` umsetzen
(= §8-Angleichung aus `docs/design/DESIGN_SYSTEM.md`). Mobile-Versionen folgen,
sobald sie auf claude.ai/design (Projekt `7e47982d-6cf6-4220-b07c-bfb3ca491569`)
fertig sind — dann per DesignSync `get_file` nachziehen.

**Design-Quelle:** Der Entwurf ist ein `.dc.html`-Mock (Template-DSL: `sc-for`,
`sc-if`, `{{ }}`) — visuelle Vorlage, **kein** direkt nutzbarer Code. Lokale
Kopie `docs/design/board/Toolkit-Redesign.dc.html` (774 Zeilen) ≈ Remote
(nur Dashboard-Top-Kacheln reicher lokal). Screens im Mock:
- Dashboard: Zeile 44–188
- Publikationen: Zeile 190–245
- Veranstaltungen (Tabelle + Kalender): Zeile 247–~470

**Arbeitsweise (User-Vorgabe):** view-by-view; nach jedem fertigen View
`/clear` + Resume erwägen (siehe Memory `context-clear-between-steps`). Dieses
Doc so pflegen, dass der nächste View ohne erneutes Einlesen startbar ist.

## Token-Mapping (Comp-Hex → Tailwind-Utility, aus `app/globals.css` @theme)
Der Mock hardcodet Hex; im Code stattdessen die Utilities nutzen:
- App-BG `#f7f8fa` → `bg-canvas` · Fläche/Track `#eef1f5` → `bg-fill`
- Border `#e2e6ec` → `border-line` · Border kräftig `#cbd2dc` → `border-line-strong`
- Muted/Placeholder `#9aa4b2` → `text-ink-muted` · Sekundär `#64707f` → `text-ink-subtle`
- Text `#475262` → `text-ink-soft` · kräftig `#333d4c` → `text-ink-strong`
- Body-FG `#16202e` → `text-ink` · Panel-BG `#fbfcfd` → `bg-surface-muted`
- Marke `#0047bb` → `bg-brand`/`text-brand`; Tint `#eef4ff` → `bg-brand-50`
- Zustände: Info `text-info`/`bg-info-tint` · Erfolg `#059669`/`#e7f7ef` `text-success`/`bg-success-tint`
  · Warnung `#d97706`/Text `#92620c`/`#fdf1e3` `text-warning`/`text-warning-ink`/`bg-warning-tint`
  · Fehler `#dc2626`/`#fdeaea` `text-destructive` (+ tint)
- Score-Skala 8-stufig → `--color-chart-bucket-1..10` (bg-chart-bucket-N)
- Karten: `bg-surface border border-line rounded-[14px] shadow-[0_1px_2px_rgba(16,32,46,.05)]`
  (Elevation-1). Mono für Zahlen: `font-mono` (Geist Mono). Radius 6/10/14/pill.

## View 1 — Dashboard  ✅ FERTIG (Desktop, in-Browser verifiziert 2026-07-04)
`app/_components/dashboard-client.tsx` komplett neu gebaut gemäß Comp:
Greeting (client-hydrated via useHydrated/useSyncExternalStore, „Guten Tag, {Vorname}")
+ Perioden-Tabs → Aktions-Kacheln (BoardTile aus boardCards / Triage=flaggedCount /
PM=pressReleasedCount+orphansCount) → 3 StatTiles → Top-Storys + Analytics
(ScoreDistribution 10 Buckets via BUCKET_BG-Literale, DimensionMeans, KeywordCloud).
tsc0/eslint0 (Em-Dash-Regel + no-setState-in-effect beachtet). NICHT committet.
Weggefallen ggü. alt: Maskottchen-Hero, Scatter, Radar(+Klick-Sort), Similarity-Histogramm
(Comp hat sie nicht — Nutzer kann vetoen). Alte Chart-Dateien (dimensions-radar,
score-similarity-scatter, score-distribution-chart) bleiben ungenutzt liegen.

**OFFEN Mobile:** Mobile-Comps für Dashboard/Pubs/Events liegen jetzt vor (User
2026-07-04): claude.ai/design Projekt `7e47982d-6cf6-4220-b07c-bfb3ca491569`,
Datei `Board-Mobile.dc.html` (bzw. Geschwisterdateien). Per DesignSync `get_file`
ziehen, wenn die Mobile-Umsetzung dran ist. Achtung: MCP-Screenshot rendert
unabhängig von resize_window in Desktop-Breite → echte Mobile-Verifikation
darüber unzuverlässig (im Zweifel echtes Gerät/DevTools).

### (Ursprüngliche Dashboard-Notiz)
Datei: `app/_components/dashboard-client.tsx` (Client). Server `app/page.tsx`
liefert `data: DashboardData`, `period`, `sortBy`, `boardCards`.
Verfügbare Daten (alle vorhanden — kein Backend nötig):
`stats.{total,peer_reviewed,analyzed,high_score_count,avg_score,score_distribution,
dimension_avgs,top_keywords}`, `topPubs[]` (PublicationListItem), `topPubsTotal/Limit`,
`flaggedCount`, `pressReleasedCount`, `orphansCount`, `webdbAsOf`, `boardCards`.
Comp-Layout: Greeting+Perioden-Tabs → Row1 Aktions-Kacheln (Board/Triage/PM) →
Row2 3 Stat-Tiles → Row3 (1.6fr/1fr) Top-Storys-Liste + Analytics-Spalte
(Score-Verteilung-Balken / Dimensions-Mittel-Balken / Keywords-Chips).
**Bewusst weggefallen ggü. Alt-Dashboard (Comp hat sie nicht):** Maskottchen-Hero,
Scatter (Score×Similarity), Radar (inkl. Klick-zum-Sortieren), Similarity-Histogramm.
Erhalten: Perioden-Tabs (URL-getrieben, `buildDashboardHref`, native `<a>`),
„Mehr laden"/periodHint, Flag-Component, InfoBubbles, PressScoreBadge.

## View 2 — Publikationen  ✅ FERTIG (Desktop, in-Browser verifiziert 2026-07-04)
Neue Karten-Liste `app/publications/_components/publication-list.tsx` (ersetzt in
`page.tsx` die `PublicationTable` — die bleibt für `/review` + Analyse-Seite in
Betrieb, NICHT anfassen). Zeile = `<Link>` auf Detail-Page: Score-Badge (reused
`PressScoreBadge`, inkl. N/A-Grund via `enrichmentReason`) | Titel + Meta
(Autor·Institut, `FlagshipBadge`, Typ-Chip `bg-fill`, Datum-Mono) + `VenueLine` +
Pitch (line-clamp-2) | rechts PM-Chip (`bg-success-tint`) + interaktiver
`PublicationFlag`-Pin (bewusst NICHT read-only — erhält Flag-Toggle) + Caret.
Kartenfuß = Count-Mono (`X–Y von Z`) + Zero-JS-Blätter (prev/next Caret) +
`press_score`-InfoBubble. `FiltersBar` entkartelt (Comp-Filterleiste ist nicht
gecardet). tsc0/eslint0/50 nahe Tests grün. **Bewusste Abweichungen ggü. Comp
(vetobar):** (1) Score-Badge = Pill (`PressScoreBadge`, wie Dashboard) statt
Comp-Mono-Quadrat — für System-Konsistenz + N/A-Handling; (2) Footer =
prev/next statt „Mehr laden" (Load-More bräuchte Client-Akkumulation; die
URL-getriebene Zero-JS-Pagination bleibt); (3) Spalten-Sort entfällt (Sort lebt
im Filter-Sheet); (4) **`PipelineActions` (Enrichment/Analyse-Trigger) BLEIBT** —
im Comp nicht gezeigt, aber page-eigene Kernfunktion; die Dimensions-Ø-Karte
wurde entfernt (redundant mit Dashboard, Comp hat sie nicht).

## View 3 — Veranstaltungen  ✅ FERTIG (Desktop-Tabelle + Kalender-Chip, verifiziert 2026-07-04)
**Tabelle** `app/events/_components/events-table.tsx` neu als Karten-Liste (wie
Pubs): farbiger Datum-Block (`DATE_BLOCK` nach `getScoreBand` — high=brand-50,
mid=warning, low=soon, none=fill) | Titel-Link + Venue + Institut/Lang-Chips |
`ScoreReasonBadge`/`n/a` | inline **Pitchen/Verwerfen** via neuem
`event-row-actions.tsx` (Client, dieselbe `/api/events/:id/decision`-Mutation wie
`EventDecisionButtons`; entschieden → Status-Pill + Reset) + `EventFlag`-Pin
(Notizen + voller Popover inkl. „Warten"/hold bleibt). Inline-Decision **in-Browser
getestet**: Pitchen→„Übernommen"+Counts↑, Reset→zurück. `page.tsx`
Sort-Href-Plumbing (buildSortHrefs) entfernt (kein Spalten-Sort mehr; Default =
Datum). **Nav** (Tabs/View-Switcher/Filterbar) war schon Comp-konform (Segmented
`bg-muted`/active `bg-background`) — unverändert gelassen.
**Kalender** (Schedule-X) war bereits Notion-Style & farb-konform zur Comp-Legende
(brand/amber-500/orange). Nur Month-Chip-Reihenfolge an Comp angeglichen
(`calendar-event-chip.tsx`: Bar→Titel→%→Decision-Icon, Icon jetzt am Ende).
**Bewusste Abweichung:** kein per-Event „Main News"-Star (es gibt KEIN
Pro-Event-Feld; `includeMainNews` ist ein Ordner-Filter) — weggelassen. „Seite/
Suche"-Extern-Link aus der Zeile entfernt (Detail-Page trägt ihn).
**Board-Deeplink „Im Board · Karte öffnen"** für gepitchte Events (Comp Z. 292)
✅ DONE 2026-07-04 (in-Browser verifiziert): neuer Batch-Query
`getCardsForEvents` (queries.ts, `sql.param(...)::uuid[]` wg. ANY-Array-Prod-Bug)
resolved die Board-Karte server-seitig (ein Query, kein Client-Wasserfall);
`page.tsx` baut die eventId→href-Map (nur Liste), `events-table` reicht sie
durch, `event-row-actions` zeigt bei gepitcht+Karte den grünen Deep-Link
(`bg-success-tint`/Kanban-Icon) statt „Übernommen"-Pill. **Abweichung vom Comp:**
Reset-Button bleibt auch bei gepitcht (Comp lässt ihn weg); ohne Karte bleibt
der Pill (unser Pitch legt keine Karte automatisch an).
**OFFEN/optional:** Nav-Restrukturierung Tabelle|Kalender-Segment nach oben-rechts
+ Monat|Woche-Sub-Segment (Comp Z. 254–257/316–319) wurde NICHT gemacht — die
bestehende Liste|Woche|Monat-Leiste bleibt.

## NEU aus Remote-Mock 2026-07-04 (Toolkit-Redesign.dc.html, Commit dabb11a)
Der Desktop-Mock wurde remote weiterentwickelt (774→1030 Zeilen) und ist ins
Repo übernommen. **OFFEN als eigener Desktop-Schnitt (nach Mobile-Phasen oder
parallel):**
- **Publikations-Detailansicht** (Mock remote Z. 214–352, `isPubDetail`):
  Zurück-Link, Header (Titel, „Ins Board", Pin, Badges/DOI), 2-Spalten —
  links Pitch-Vorschlag (Blickwinkel/Zielgruppe), Zusammenfassung, Haiku-Karte,
  Autor:innen, externe Anreicherung; rechts sticky Relevanz-Analyse (Score-
  Kreis, 5 Dimensions-Balken, Begründung, Modell/Kosten) + Redaktions-
  entscheidung (Pitchen/Verwerfen). Betrifft `app/publications/[id]`.
- **Dashboard-Umbau:** Kachelgrid 3→1 Spalte (nur noch Board-Kachel; Triage-/
  PM-Kachel im Mock gestrichen); Pub-Zeilen klicken auf die Publikation
  (bei uns bereits so gebaut — Dashboard-Kacheln ggf. angleichen, vetobar).

## Status Commits (2026-07-04)
- `c532111` feat(design): Toolkit-Redesign Views 1–3 (Desktop) — **committet**
  (nicht mehr „UNCOMMITTED", trotz obiger Alt-Formulierungen im Doc).
- `13bce79` chore(dev): Dev-User-Switcher · `cbb23d3` docs(ops): OPS-Log.
- `2c3f487` feat(events): „Im Board · Karte öffnen"-Deep-Link (View-3-Punkt b).
- **Noch NICHT gepusht** (Vercel+Coolib) — vor dem Push mit User abstimmen.

## MOBILE — Voller Native-Shell (User-Entscheidung 2026-07-04, mehrere Sitzungen)
**Scope-Entscheidung:** Nicht nur responsive Desktop-Inhalte, sondern die
**komplette native Mobile-App-Hülle** aus dem Mock. Vorlage jetzt IM REPO:
`docs/design/board/Board-Mobile.dc.html` (Phase-0-Konvention: nur .dc.html;
Screenshots im Design-Projekt `7e47982d`, Datei `Board-Mobile.dc.html`, NICHT
geholt). Zeilen-Anker im Mock: Dashboard 263 · Publikationen 360 ·
Veranstaltungen 414 · Bottom-Nav 539 · Card-Sheet 549 · Event-Detail-Sheet 758 ·
Publikation-Detail 797. **Der Mock ist eine self-contained SPA** (Screen-Wechsel
per State); bei uns ist jeder Screen eine Route → State-Switch wird zu
Route/`md:`-Split.

**Architektur-Ansatz (SSR-sicher, kein JS-Hook):** Mobile = unter `md` (768px).
Desktop-UI mit `hidden md:...`, Mobile-UI mit `md:hidden` überlagern —
KEIN `useIsMobile`-Hook (Hydration-Falle). Bestehende Top-Nav bleibt (blaue
`bg-brand`-Leiste + Hamburger-Sheet); der Mock ergänzt eine **Bottom-Tab-Nav** +
per-Screen blaue App-Header. Tokens/Utilities wie oben (§Token-Mapping);
Phosphor via `@/lib/icons`; Geist Mono für Zahlen. Routen/Icons für die
Bottom-Nav aus `components/nav.tsx` `PRIMARY[]` wiederverwenden
(/,/publications,/events,/review,/board mit BarChart3/BookOpen/CalendarDays/
ClipboardCheck/Kanban).

**Phasenplan (in dieser Reihenfolge, je Phase: tsc0/eslint0 + In-Browser + Commit):**
- **M1 Bottom-Tab-Nav** ✅ FERTIG 2026-07-04 — `components/mobile-bottom-nav.tsx`
  (`md:hidden`, fixed bottom z-40, alle 5 PRIMARY-Tabs, aktiv = `text-brand` +
  Phosphor `weight="fill"`, Label `/events`→„Events" wg. Slot-Breite; kein
  „Mehr"-Tab — SECONDARY/ADMIN bleiben im Top-Hamburger). `nav.tsx` exportiert
  `PRIMARY`+`isActiveLink`; `layout.tsx`: `<main>` `pb-[76px] md:pb-6`, Footer
  `hidden md:block` (läge sonst hinter der Nav). Verifiziert via **Playwright
  390×844** (MCP-Tab rendert nur Desktop-Breite; Skript-Muster: storageState
  aus `e2e/.auth/state.json` bzw. Gate-Login wie `e2e/global-setup.ts`,
  `reducedMotion:'reduce'`; /board braucht CDP-`Page.captureScreenshot` —
  `page.screenshot` timeoutet dort an Dauer-Repaint. KEIN `isMobile:true`
  verwenden: kombiniert mit Overflow entstehen Screenshot-Artefakte).
  **BEFUND für M5:** /events (Desktop-Layer) hat ~200px Horizontal-Overflow
  auf 390px (Status-Pill-Leiste, scrollWidth 590) — auf echten Geräten störend;
  wird durch die M5-Agenda ersetzt, bis dahin bekannt.
- **M2 Per-Screen Mobile-Header** — kompakter blauer App-Header (Icon+Titel+
  Sub+Avatar) statt der Desktop-`<h1>`-Blöcke, nur `md:hidden`. Als shared
  `components/mobile-screen-header.tsx`, pro Screen mit passendem Icon/Sub.
- **M3 Dashboard mobil** ✅ FERTIG 2026-07-04 — `dashboard-client.tsx`:
  Desktop-Stack in `hidden md:block` gewrappt (Vorher/Nachher-Screenshot
  1440×900 byte-identisch), darunter `md:hidden`-Stack nach Mock Z. 263–358:
  Perioden-Chips (x-scroll, `-mx-4`-Bleed, aktiv = bg-brand) → `BoardTile`
  (Desktop-Komponente wiederverwendet; nur angemeldet, Gate-User sieht sie
  nicht) → 2×2-Stat-Grid (neue `MobileStatTile`: Icon duotone oben, Mono-Wert;
  4. Kachel = „für Triage geflaggt" ersetzt mobil die Triage-Aktions-Kachel;
  Labels als `statLabels` extrahiert, beide Layer teilen sie) → Top-Storys
  kompakt (Rang-Kreis top-3 brand, Autor·Institut, `PressScoreBadge`; ohne
  Venue/Pitch/Datum wie im Mock) → `DimensionMeans` → Keywords-Karte.
  Bewusst: kein Gruß-Header mobil (kommt in M2 als blauer App-Header), keine
  ScoreDistribution + keine PM-Kachel (Mobile-Mock hat beide nicht; PM via
  Hamburger erreichbar). Verifiziert Playwright 390×844 (kein H-Overflow,
  scrollWidth=390); tsc0/eslint0.
- **M4 Publikationen mobil** ✅ FERTIG 2026-07-04 (Playwright 390×844 verifiziert:
  kein H-Overflow, Chip→`?flagged=true`, „Alle"-Reset, Suche→`?q=`; Desktop 1440
  unverändert; tsc0/eslint0/21 Filter-Tests grün) — Mock Z. 360–412:
  `filters-bar.tsx` in Desktop-Layer (`hidden md:flex`) + Mobile-Layer
  (`md:hidden`: eigenes Such-Input `#publications-search-mobile`, teilt
  Debounce/State mit Desktop, + 5 Schnellfilter-Chips x-scroll im
  M3-Bleed-Muster). Schnellfilter = single-select auf bestehende URL-Felder
  (Alle=Reset · Hohes Potenzial=`minScore:70` · Eigen-Highlights=`maHl`+
  `showAll` · Mit PM=`pressReleased:yes` · Geflaggt=`flagged`), aktiver Chip
  rein aus Filterwerten abgeleitet; Chip-Wechsel resettet PRESET_FIELDS +
  Quick-Felder, Modifier überleben (applyPreset-Semantik). `publication-list.tsx`:
  Desktop-Karte `hidden md:block`, mobil gestapelte Einzelkarten (PressScoreBadge
  + Titel + Autor·Institut + Pitch clamp-2 + Chip-Reihe: Flagship-Krone-Pill
  bzw. Venue-Text/Typ/PM/„Geflaggt"-statisch) + zentrierter Mono-Count-Footer
  mit prev/next. `page.tsx`: h1-Header + PipelineActions `hidden md:*`.
  `lib/icons.ts` + `Rows`. **Abweichungen (vetobar):** Mock-Chip „Flagship" →
  „Eigen-Highlights" (kein Flagship-Listen-Filter im Backend, nur Journal-Tier);
  Score-Badge = PressScoreBadge-Pill (wie Desktop-View-2-Abweichung, N/A-Grund);
  Footer paginiert statt Mock-Gesamtcount; Show-All/Filter-Sheet/ActiveFilters
  bleiben Desktop-only; Flag-Pin mobil statischer Chip (Toggle auf Detail-Page).
- **M5 Veranstaltungen mobil** ✅ FERTIG 2026-07-04 (Commit `2cb9b93`) —
  Mock Z. 414–536. Neue Dateien in `app/events/_components/`:
  `events-agenda.tsx` (Tag-Gruppen „Fr · 4. Juli" nach Wiener Zivildatum via
  neuem `eventDayKey` in event-format.ts; Karte = 3px-Akzentbalken nach
  Score-Band + Titel/Venue/`ScoreReasonBadge` + full-width Pitchen/Verwerfen;
  gepitcht+Karte→„Im Board"-Deep-Link, sonst Status-Pill+„Zurück"),
  `mobile-month-calendar.tsx` (Client: 7-Spalten-Grid, ≤3 Band-Punkte/Tag,
  Heute-Kreis, Tages-Tap→Tagesliste mit Decision-Pill; Prev/Next URL-getrieben
  `?date=`, Auswahl per `key={anchor}` resettet; **handgerollt statt
  react-day-picker** — Mock-Grid nur gegen Library-Styles erreichbar),
  `events-mobile-controls.tsx` (Segment Agenda|Kalender über `?view=month` +
  5 Entscheidungs-Tab-Chips mit Counts + Main-News-Stern, Zero-JS-Links,
  Bleed-Scroll wie M3/M4). `event-row-actions.tsx`: Mutation als
  `useDecisionMutation`-Hook + `EventAgendaActions`. `page.tsx`: md:-Split;
  Board-Deep-Link-Query auch für `view=week` (läuft mobil durch die Agenda).
  Icons + `CalendarX`/`Zap`. **Abweichungen (vetobar):** Kommend|Vergangen →
  die 5 bestehenden Tabs (kein Past-Tab im Backend); ScoreReasonBadge statt
  Mock-Mono-Badge; kein per-Event „Main"-Stern; `?view=week` mobil = Agenda
  der Woche. Verifiziert Playwright 390×844 (kein H-Overflow Agenda/Monat;
  Pitch→Im Board→Zurück-Roundtrip; Tages-Tap; Monats-Nav; Desktop 1440
  unverändert inkl. Schedule-X); tsc0/eslint0/583 Tests. Damit ist der
  §M1-Befund (~200px H-Overflow der Desktop-Tabelle) mobil behoben.
- **M6 Detail-Bottom-Sheets** — Card-/Event-/Publikations-Detail auf Mobile als
  von-unten-Sheet (statt Desktop-Modal): Grabber/Caret-Down-Close, Meta-Rows,
  Checkliste, Kommentare. Mock Z. 549–850. Größte Phase; ggf. weiter splitten.

**Empfehlung:** M1 zuerst (self-contained, hoher Signalwert, geringes Risiko),
dann M3 als erste komplette Screen-Umsetzung zur Validierung des `md:`-Split-
Musters, dann M4/M5, M2 (Header) mitziehen, M6 zuletzt. Mechanisch genug für
einen **Fable-Lauf** — der Plan ist deterministisch, Vorlage + Tokens liegen fest.

## Verifikation
Dev-Server läuft (`npm run dev`, Port 3000). In-Browser prüfen (MCP-Tab, oder
Dev-User-Switcher für Rollen). `npx tsc --noEmit` + `eslint --max-warnings=0`.
**Mobile-Achtung:** MCP-Screenshot rendert unabhängig von `resize_window` in
Desktop-Breite → für echte Mobile-Verifikation Chrome-DevTools-Device-Mode
oder echtes Gerät; die `md:hidden`-Layer lassen sich aber via schmalem
Fenster/DevTools prüfen.
