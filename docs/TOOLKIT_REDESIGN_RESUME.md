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
**OFFEN/optional:** Nav-Restrukturierung Tabelle|Kalender-Segment nach oben-rechts
+ Monat|Woche-Sub-Segment (Comp Z. 254–257/316–319) wurde NICHT gemacht — die
bestehende Liste|Woche|Monat-Leiste bleibt; Board-Deeplink „Im Board · Karte
öffnen" für gepitchte Events (Comp Z. 292) offen.

## Verifikation
Dev-Server läuft (`npm run dev`, Port 3000). In-Browser prüfen (MCP-Tab, oder
Dev-User-Switcher für Rollen). `npx tsc --noEmit` + `eslint --max-warnings=0`.
