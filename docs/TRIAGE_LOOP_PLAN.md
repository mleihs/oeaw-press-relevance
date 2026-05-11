# Triage-Loop — UX/UI-Plan

Stand: 2026-05-04. Status: **Vorschlag, in Diskussion.**

Verfasst aus drei Recherche-Strängen (UI-Library-Landschaft 2026, Plattform-Patterns von Linear/Notion/Raycast/Vercel/Superhuman/NewsWhip/Muck Rack, Domain-spezifische Patterns von Altmetric/Semantic Scholar/Dimensions/OpenAlex/NewsWhip/Cision) plus direktem UI-Audit aller bestehenden Seiten.

---

## 1. Zentrale These

Das Tool hat aktuell die Mechanik einer **persönlichen Datenbank-Suchmaschine** und braucht die Mechanik eines **kollaborativen Review-Werkzeugs**. Das ist nicht nur eine UI-Frage, sondern betrifft Datenmodell (Decision-State, Sitzungs-Entität, Notizen), Seiten-Architektur (eine eigene `/review`-Seite) und Information-Density (Beamer-tauglich vs. Solo-Laptop).

Die **eine Verschiebung**, die alles trägt: aus der List+Detail-Loop (klicken → navigieren → zurück) wird eine **Inline-Expand-Card-Liste mit Decision-Buttons in der Karte selbst**. Das stammt aus NewsWhip Spike, passt zum Team-Bildschirm-Setup und löst gleichzeitig den größten Teil der „Detail-Seite ist zu lang"-Schmerzen.

## 2. Nutzungskontext (bestätigt)

- **Mehrere Personen** im Press-Team.
- **Wöchentliche Sitzung**, gemeinsame Entscheidung.
- **Ein geteilter Bildschirm** (Beamer/Screensharing), kein Multi-Laptop-Setup.
- **30–100 Pubs/Woche** zu reviewen.
- **Editorial Loop nach „Pitch"** bleibt einstweilen in MeisterTask. Spätere Migration ist eingeplant (Phase E).
- **`mahighlight`** ist nicht das Hero-Signal — Score und AI-Reasoning sind primär.

## 3. Die kanonische Sitzung (North Star)

```
Mo–Do (asynchron):
  Jede:r im Team öffnet /publications, setzt 📌-Flag mit Notiz auf
  3-5 spannende Pubs. Flags stapeln (mehrere Personen können
  dieselbe Pub flaggen).
  Optional: Donnerstag-Email-Digest "12 ready for discussion".

Fr 10:00 (Sitzung, 60-90 min, ein geteilter Bildschirm):
  /review öffnet die Sitzungs-Queue:
    [flagged] OR [score≥70 since last meeting] OR [mahighlight]
  Pub-Karten kompakt, eine Zeile.
  Click → expand inline:
    Titel + Haiku als TLDR direkt drunter
    Score-Donut + Reasoning daneben (Diskussions-Anker)
    Abstract-Snippet + Pitch-Vorschlag + suggested angle (alle editierbar)
    Drei dicke Buttons: Pitch / Hold / Skip
    Optionales Rationale-Feld + Notizen aus der Vorbereitung.
  Nach Klick: Karte schließt, fadet aus, Counter "11 left" tickt.

Fr 11:00 (Nachbereitung, automatisch):
  Pitch-Decisions → MeisterTask-Tasks (vorhandene Wiring).
  Hold → bleibt in Queue, snooze_until = nächste Sitzung.
  Skip → archiviert.
  Sitzungs-History: "Sitzung 2026-04-15 — 23 Pubs entschieden,
                    8 Pitch / 4 Hold / 11 Skip".
```

Solo-Vorbereitung nutzt dieselbe `/publications` mit Peek-Modus (Phase C).

## 4. Inventur — was bleibt, was fliegt

| Aktuell | Bewertung | Empfehlung |
|---|---|---|
| `/publications` Liste + Filter-Sheet + Presets + Chips | Solide, gut durchgedacht, nuqs-Setup sauber | **Behalten**, später erweitern (Phase C) |
| `/publications/[id]` Detail-Page mit 7 Cards | Falsche Reihenfolge: Pitch + Score zu weit unten | **Reordern + Tabs einbauen** (Phase B) |
| `/dashboard` (Hero + 4 Stats + Top-10 + Histogramm + Radar + Keywords) | Kein Workflow-Einstieg, viel Dekoration | **Reduzieren auf Launcher** + Inbox-Counter (Phase B) |
| `/analysis` | 80%-Klon von /publications | **Löschen**, Inhalt in Tabs auf /publications (Phase A) |
| `/researchers` mit Spotlight + Tabs (Liste + Beeswarm) | Demo-Material, kein Triage-Werkzeug | **Demote zu Panel auf /dashboard**; Beeswarm interaktiv machen oder cutten (Phase C) |
| `/upload`, `/settings` | OK | unverändert |
| Top-Nav: 6 Items | Heterogen | umordnen: **Triage / Publikationen / Pitches / Stats / Import / Settings** (Phase B) |
| MeisterTask-Button im Detail | Funktioniert, einseitig sichtbar | **Wird Decision-State-Trigger**, nicht eigener Button (Phase A) |
| `useKeyboardShortcuts` (`/` `⌘K` `←` `→`) | Minimalistisch | erweitern auf vollständiges Modell (Phase C) |
| `nav.tsx` „Erklärungs-Bubbles AN/AUS"-Toggle | Header-Clutter | **In Settings verschieben** (Phase A) |

## 5. Sieben nicht-offensichtliche Recherche-Erkenntnisse

### 5.1 Inline-Expand statt Peek-Panel (NewsWhip Spike)

NewsWhip rendert Karten kompakt, expand-in-place beim Klick (mit Sparkline drin). Für ein Team-Meeting auf einem Bildschirm ist das **besser als das Linear-Peek-Panel**: alle sehen denselben Inhalt, niemand verliert Kontext durch das Side-Panel, der/die Moderator:in muss keinen geteilten Cursor managen. Peek-Panel ist Solo-First, Inline-Expand ist Team-First.

**Komponente:** shadcn `<Collapsible>` innerhalb `<Card>`-Row. Animation via CSS-Grid `grid-template-rows: 0fr → 1fr`-Trick (kein Layout-Shift).

### 5.2 Haiku als TLDR direkt unter den Titel (Semantic Scholar)

S2 setzt einen TLDR-Block genau zwischen Titel und Abstract — fett-Label, eine Zeile, optional kursiv. Das passt 1:1 auf das vorhandene Haiku. Aktuell sitzt das Haiku in Card #4. Hochziehen → wird vom „nice gimmick" zur tatsächlichen Diskussions-Eröffnungszeile in der Sitzung.

**Komponente:** bestehender `<HaikuBlock>` direkt nach `<h1>` rendern, vor allen Cards.

### 5.3 Score als Donut, nicht als Prozent-Pille (Altmetric)

Aktuell: `75%` Pille in `bg-[#0047bb]`. Funktioniert, sagt aber nichts darüber, *warum*. Altmetrics Donut zeigt im Zentrum die Zahl, im Ring die Aufschlüsselung nach Quelle. Adaption: **die fünf StoryScore-Dimensionen** (`public_accessibility`, `societal_relevance`, `novelty_factor`, `storytelling_potential`, `media_timeliness`) werden zu fünf Ring-Segmenten — jede mit ihrer eigenen Farbe (sind schon in `SCORE_COLORS` definiert), Segment-Länge proportional zur Dimension.

Das gibt der Sitzung einen visuellen Ankerpunkt: *„Schau, hier ist der Stör-Faktor 'media_timeliness' — das müssen wir noch heute pitchen."*

**Komponente:** SVG, ~30 Zeilen. Drei Größen (16 px in der Liste, 32 px im Expand, 80 px in der Detail-Page).

### 5.4 Categorical Override auf jedem AI-Feld (Cision)

CisionOne lässt Nutzer:innen per Klick die AI-Sentiment-Klassifizierung ändern; die Korrektur persistiert und fließt zurück. **Kein einziges akademisches Tool macht das** (Altmetric, S2, Dimensions, OpenAlex: alle nur read-only). Für StoryScout ist das ein echter Differenzator: jedes AI-Feld (Score-Band, Pitch, Angle, Target Audience) bekommt einen Edit-Modus per Click. Geänderte Werte werden gespeichert, in der History steht „angepasst von Marie am 2026-04-15".

**Komponente:** shadcn `<DropdownMenu>` auf einem `<Badge>` für Kategorie-Overrides; `<Popover>` mit `<Textarea>` für Freitext-Felder.

### 5.5 Compact-by-default + Beamer-Mode (Cloudscape)

Aktuell ist die Liste in einer Größe da. Im Solo-Laptop will man compact (28 px Zeilen). Auf dem Beamer in der Sitzung will man presentation (lesbar aus 3 m). Cloudscape benutzt 2 Modi (nicht 3), das reicht. Tailwind-Trick: `data-density="presentation"` auf Wrapper, dann `data-[density=presentation]:text-base` etc.

**Komponente:** Toggle in der Header-Bar, persistiert in localStorage.

### 5.6 Sitzung als DB-Entität (Sanity)

Sanitys editorial-workflow-Plugin modelliert „state-transitions"-Events explizit. Für StoryScout: eine `review_sessions`-Tabelle, lightweight. Damit lässt sich später sagen „zeig mir alle Pitches aus der Sitzung vom 15.04." und „wie viel Throughput hatte die Sitzung am 15.04. vs. 22.04.?". Das ist die Grundlage für Phase E (Story-Bundles + Editorial-Loop).

### 5.7 Briefing-Email als Sitzungs-Vorbereitung (Altmetric + NewsWhip)

Altmetrics Saved-Search-Email-Digest ist die einzige genuin valuable Email-Notification in der Domäne. Für StoryScout: ein Cron-Job, der **Donnerstag-Abend** eine Email pro Team-Mitglied sendet:

```
Sitzungs-Vorbereitung — Freitag 10:00

12 neue Pubs seit letzter Sitzung mit Score ≥ 70:
  ★ "Vögel singen Sprache..." — Score 87, Eigen-Highlight, IMBA-Lab
    Haiku: Vögel singen / Sprache der Erinnerung / Wir verstehen nichts
    AI-Pitch: Pitch an ORF Wissen — Verbindung von Tierkommunikation
              und Spracherwerb...

3 weitere mit Score 60-70: ...

5 Pubs sind bereits geflaggt:
  📌 Marie: "passt evtl. ins Klima-Special"
  📌 Stefan: ...

Direkt zur Sitzungs-Queue → /review
```

NewsWhips „briefing not a ping"-Prinzip: nicht „12 neue Pubs", sondern **kontextualisiert mit Reasoning**.

## 6. Roadmap

Fünf Phasen. **A = Pflicht-Fundament** vor allem anderen. **B = Hauptgewinn** (Sitzungs-Loop). **C = Polish.** **D + E = später.**

### Phase A — Fundament (1 Tag)

| # | Was | Warum | Files / Komponenten |
|---|---|---|---|
| A1 | DB-Migration: `decision`, `decided_at`, `decided_by`, `decision_rationale`, `flag_count`, `flag_notes` (jsonb), `snooze_until` | Voraussetzung für alle Decision-UI | s. §8 |
| A2 | DB-Migration: `review_sessions` Tabelle + FK | Audit-Loop, Phase-E-Vorbereitung | s. §8 |
| A3 | Refactoring: `STATUS_LABELS`, `OA_LABELS`, score-band-logic in `lib/constants.ts` + `lib/score-utils.ts` | Konsistenz | 30 min, ~3 Files berührt |
| A4 | Tailwind-Theme: `colors.brand.*` statt `#0047bb`-Stringliterals | Dark-Mode + Theming-Vorbereitung | `tailwind.config.ts` + grep-replace ~50 Stellen |
| A5 | TanStack Query v5 unter `QueryClientProvider`; alle `useEffect+fetch` migrieren | Optimistic Updates, Cache-Invalidation, Hover-Prefetch | Schließt Memory-Punkt `react_data_fetching_decision`. **Pick: TanStack Query v5** (siehe §10) |
| A6 | `/analysis`-Seite löschen, ihre Inhalte (Dimensions-Avg-Block + Export) als Tabs auf `/publications` | Konsolidierung | `app/analysis/` weg, `app/publications/_tabs/` rein |
| A7 | LoadingState/EmptyState vereinheitlichen | Vier Implementierungen → eine | s. §11 Refactoring-Liste |
| A8 | „Erklärungs-Bubbles"-Toggle aus Header → Settings | Header entlasten | `components/nav.tsx`, `app/settings/` |

**Risiko:** niedrig. Reines Backend + Aufräumarbeit. Keine UX-Änderung sichtbar für Nutzer:innen.

### Phase B — Sitzungs-Loop (2-3 Tage)

| # | Was | Warum | Komponenten/Picks |
|---|---|---|---|
| B1 | **Flag-Feature** auf jeder Pub-Row (📌-Stern + Notiz-Popover) | Async-Vorarbeit | `<Button>` + `<Popover>` mit `<Textarea>` |
| B2 | **Inline-Expand-Karten** in `/publications` und `/review` (kompakte Zeile → Klick → expandiert in-place mit Reasoning, Pitch, Decision-Buttons) | DAS Triage-UX-Update | shadcn `<Collapsible>` + CSS-Grid-Trick |
| B3 | **Drei Decision-Buttons im Expand**: Pitch / Hold / Skip + optionales Rationale-Feld | Kollaborative Entscheidung | Standard-Buttons, optimistic-update via TanStack Query |
| B4 | **`/review` als eigene Seite** mit Sitzungs-Queue (flagged OR score≥X seit letzter Sitzung) | Meeting-Modus separat | neue Seite, recycelt `<PublicationCard expanded />` |
| B5 | **Density-Toggle inkl. Beamer-Mode** in der Liste | Beamer-Tauglichkeit | Header-Toggle + `data-density` CSS |
| B6 | **Detail-Page-Reorder**: Header → Haiku-TLDR → Decision-Toolbar → Pitch + ScoreDonut → Tabs(Summary \| Authors \| Projects \| Enrichment) | Pitch + Score sichtbar ohne Scroll | `app/publications/[id]/_components/{header,haiku-tldr,decision-toolbar,score-donut,tabs}.tsx` |
| B7 | **`<ScoreDonut>` Komponente** (Altmetric-Pattern, 5 Segmente entsprechend `SCORE_COLORS`) | Visuelle Reasoning | ~30 Zeilen SVG, Recharts wäre Overkill |
| B8 | **Decision-History-Panel** auf der Detail-Page („Entschieden in Sitzung 2026-04-15: Pitch — von Team — 'Klima-Paket'") | Audit-Loop | shadcn `<Card>` mit `<Separator>` |
| B9 | **Top-Nav-Umbau**: Dashboard / Triage / Publikationen / Pitches / Stats / Import / Settings | Klare Jobs pro Eintrag | `components/nav.tsx` |
| B10 | **Dashboard zur Launcher-Seite**: 1 dicke „Sitzungs-Queue starten"-Schaltfläche, Counter (X seit letzter Sitzung, Y geflaggt), Mini-Chart Wochen-Throughput nach Decision | Workflow-Einstieg | `app/page.tsx` umbauen, ~80% des Inhalts wegwerfen |

**Risiko:** mittel. Nutzer-sichtbar, ändert das Bedienmodell substantiell. Mit dem Team früh testen.

### Phase C — Polish (1-2 Tage, nach 2 Wochen Praxis)

| # | Was | Warum |
|---|---|---|
| C1 | **Solo-Peek-Modus** (`Space` + `J/K`) nur in `/publications` (nicht `/review`) | für asynchrone Vorarbeit |
| C2 | **TanStack Table v8** mit Spalten-Resize, Density-Modus, GroupBy ÖSTAT3-Super-Domäne | Domain-Breite-Problem |
| C3 | **Filter-Bar mit Token-Syntax** (`is:peer-reviewed institute:IMBA score:>70`), Saved Views als Chips, optional AI-NL-Filter | Power-User-Flow |
| C4 | **Categorical-Override auf AI-Feldern** (Score-Band, Pitch-Text, Angle, Target Audience editierbar inline) | Cision-Pattern, §5.4 |
| C5 | **Globales `⌘K`-Command-Palette** (cmdk/shadcn `<Command>`) | Power-User |
| C6 | **`?`-Shortcut-Overlay** | Discoverability |
| C7 | **View Transitions API** auf List → Detail | Free Speed-Win |
| C8 | **`/researchers` Demote**: zu Panel auf Dashboard, Beeswarm interaktiv (Click → /publications gefiltert) | Nav entlasten |
| C9 | **`<ScoreChip>` mit 3-Band-Dot** in Listenansicht statt 0-100% | Reduziert visuelles Rauschen |

### Phase D — Briefing & Stats (1 Tag)

| # | Was | Warum |
|---|---|---|
| D1 | **Donnerstag-Email-Digest** (Cron + React-Email + Resend/Postmark) | Sitzungs-Vorbereitung |
| D2 | **Sitzungs-Stats**: pro Sitzung Pitch/Hold/Skip-Counts, Trend über Zeit | Selbstreflexion „letzte Sitzung Pitch-Quote 35%, davor 12%, was war anders?" |
| D3 | **Saved-Filter-Views als Team-Resource** (geteilt, nicht per-User) | „Klima-Filter", „IMBA-Pubs" als Team-Vokabular |

### Phase E — Strategisch (später, nicht jetzt planen)

| # | Was | Warum |
|---|---|---|
| E1 | **`pitch_log` + `coverage`-Tabellen** (Memory `editorial_pipeline_proposal`) | Wenn MeisterTask migriert wird |
| E2 | **`stories`-Entität + pgvector** (Memory `story_bundles_proposal`) | Verwandte Pubs bündeln |
| E3 | **Dimensions-style FCR**: „diese Pub ist 2.4× besser als typische Pub in ihrem Feld diesen Monat" | Benchmarking-Score, computer-non-trivial |
| E4 | **Multi-Lang-Pitch-Editor** (DE/EN-Tabs) | Internationale Journalist:innen |

## 7. Skip-Liste — was NICHT zu bauen ist

Bestätigt durch die Recherche, gegen diverse mögliche Versuchungen:

- ❌ **Mantine 9 Migration** — würde shadcn-Stack zerstören, kein Gegenwert
- ❌ **Base UI Migration** — cmdk/vaul-Lücke noch nicht geschlossen, Q4-2026 reevaluieren
- ❌ **react-aria-components Vollmigration** — nur Jolly-UI-Cherry-Picks falls a11y kritisch wird
- ❌ **Tremor `@tremor/react` npm package** — paralleles Design-System; bei Bedarf einzelne Tremor-Raw-Blocks copy-paste
- ❌ **react-arborist** — overengineered, simple `<Collapsible>` reichen
- ❌ **TanStack Table v9 alpha** — auf Stable warten
- ❌ **Live-Collab / Echtzeit-Awareness (Liveblocks/Yjs)** — overkill für wöchentliches Meeting mit Ein-Bildschirm-Setup
- ❌ **Drei verschiedene Density-Modi** (Cloudscape: zwei reichen)
- ❌ **`mahighlight` als Hero-Signal** — entschärfen, nicht prominenter machen
- ❌ **Rich-Text-Editor für Pitch-Text** (Plate/Tiptap) — `<Textarea>` reicht für 95%

## 8. Schema-Änderungen (vollständig)

```sql
-- A1: Decision-State + Flagging
ALTER TABLE publications
  ADD COLUMN decision text
    CHECK (decision IN ('undecided','pitch','hold','skip'))
    DEFAULT 'undecided',
  ADD COLUMN decided_at timestamptz,
  ADD COLUMN decided_by text,                      -- "team" oder Person-Name
  ADD COLUMN decision_rationale text,
  ADD COLUMN snooze_until date,
  ADD COLUMN flag_count int DEFAULT 0,
  ADD COLUMN flag_notes jsonb DEFAULT '[]'::jsonb;
  -- flag_notes: [{by: string, note: string, at: timestamptz}, ...]

CREATE INDEX idx_publications_decision ON publications (decision);
CREATE INDEX idx_publications_snooze ON publications (snooze_until)
  WHERE snooze_until IS NOT NULL;

-- A2: Sitzungs-Entität
CREATE TABLE review_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL,
  attendees text[],
  facilitator text,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE publications
  ADD COLUMN decided_in_session uuid REFERENCES review_sessions(id);

-- C4: AI-Override (Phase C)
ALTER TABLE publications
  ADD COLUMN ai_overrides jsonb DEFAULT '{}'::jsonb;
  -- z.B. {"pitch": "edited text", "angle": "user version", "target": "..."}
```

**MeisterTask-Wiring**: bestehende Wiring nutzt `meistertask_task_token`. Diese bleibt; einziger Trigger-Punkt ändert sich von „MeisterTask-Button-Click" zu „decision wird auf 'pitch' gesetzt". Server-Action prüft `pub.decision === 'pitch' && !pub.meistertask_task_token` und ruft den vorhandenen Task-Create-Code auf. Alte MeisterTask-Buttons können weg, sobald Phase B durch ist.

## 9. Information-Architecture-Zielzustand

```
/                       Dashboard (Launcher)
                        - "Sitzungs-Queue starten" (CTA)
                        - Counter: 23 ungeflaggt, 12 geflaggt seit letzter Sitzung
                        - Wochen-Throughput-Chart
                        - Top-3-Forscher:innen (kompakt, demoted aus /researchers)

/review                 Sitzungs-Modus (NEU)
                        - Sitzungs-Queue (Inline-Expand-Karten)
                        - Density: Beamer-Mode default
                        - Counter "23 left"

/publications           Katalog + Tabs
                        - List | Stats | Timeline | By-Domain | By-Institute
                        - Filter-Sheet, Presets, Active-Chips
                        - Inline-Expand-Karten

/publications/[id]      Detail
                        - Header → Haiku-TLDR → Decision-Toolbar
                        → Pitch + ScoreDonut → Tabs
                        - History-Panel unten

/pitches                NEU: Decision = Pitch View
                        - Status-Tracking
                        - Liste der Pitches der letzten N Wochen

/persons/[id]           Personen-Detail (unverändert)

/upload                 Import (unverändert)

/settings               + Erklärungs-Bubbles-Toggle
                        + Default-Density
```

`/analysis` und `/researchers` weg.

## 10. Konkrete Library-Picks (verifiziert May 2026)

| Bedarf | Pick | Status |
|---|---|---|
| Data fetching/state | **TanStack Query v5.100** | 12.3M downloads/wk, mature |
| Listen-Filter-Pattern | **openstatus/data-table-filters** | BYOS-Adapter mit nuqs, registry-installierbar |
| Inline-expand-Card | **shadcn `<Collapsible>` + `<Card>`** | bereits installiert |
| Drawer (Mobile) | **vaul via shadcn `<Drawer>`** | bereits installiert |
| Toast (Undo) | **sonner** | bereits installiert, Action-Button-Support |
| Command Palette | **shadcn `<Command>` (cmdk)** | bereits installiert |
| Donut/Charts | **plain SVG für ScoreDonut**, recharts nur für Stats | recharts shadcn-bundled |
| Drag/Resize Panes | **react-resizable-panels** (5.2k stars, aktiv) | falls split-pane in Phase C |
| List Drag/Drop | **dnd-kit** | falls Reordering in Phase D |
| Email | **React Email + Resend oder Postmark** | für Phase D Digest |
| Animation | **motion v12** (formerly framer-motion) | bereits installiert |
| Date snooze input | **chrono-node** | für „1w", „nächste Sitzung"-Parsing |

**Optional via `npx shadcn add @kibo-ui/...`:**
- `@kibo-ui/list` als Basis für Inline-Expand-Karten
- `@kibo-ui/dropzone` falls `/upload` ein Update bekommt

## 11. Refactoring-Backlog (innerhalb Phase A integriert)

Hoher Wert / niedrige Kosten:

1. **Single Source of Truth für `STATUS_LABELS` / `STATUS_COLORS` / `OA_LABELS`** — aktuell in `app/publications/[id]/page.tsx` UND `components/publication-table.tsx` dupliziert. → `lib/constants.ts`.
2. **`#0047bb` als Tailwind-Theme-Color** — ~50 String-Literal-Stellen.
3. **Score-Band-Logik (`>=70`/`>=50`/`>=30`)** zentralisieren — aktuell mehrfach inline in `[id]/page.tsx:434-449`, `score-bar.tsx:83-86`. → `lib/score-utils.ts` mit `getScoreBand(score)`.
4. **Loading-States vereinheitlichen** — vier Implementierungen, Ziel: alles `<LoadingState>`.
5. **Empty-States vereinheitlichen** — `<EmptyState icon title body action />`-Komponente.

Mittlerer Aufwand:

6. **`fetchData()`-Boilerplate** in 4 Pages → TanStack Query (A5).
7. **`/analysis` löschen** (A6) — 80% Klon von `/publications`.
8. **`publication-table.tsx` (588 Zeilen) zerlegen** in `_table/{row,mobile-card,expanded-detail,badges}.tsx`.
9. **Detail-Seite (585 Zeilen) zerlegen** in `_components/{header,pitch-card,summary-card,…}.tsx` — Voraussetzung für Reorder (B6).

Kleinere:

10. **Dashboard-Tabs (`TIME_TABS` als hand-built tablist)** vs. shadcn `<Tabs>` (Researchers) — eine Variante reicht.
11. **`SortIcon`** lokal in `publication-table.tsx`, dieselbe Logik in `/analysis` → `components/ui/sort-icon.tsx`.
12. **Drei `SourceInfoBubble`-Definitionen** vereinen.
13. **`displayTitle()`** ggf. memoizieren (low priority).

## 12. Erfolgs-Metriken

Phase B gilt als erfolgreich, wenn:

- Eine wöchentliche Sitzung mit der neuen `/review`-Seite ohne Friktion durchläuft.
- ≥ 80 % der entschiedenen Pubs haben einen `decision_rationale`-Wert (= Begründung wird tatsächlich erfasst).
- Die durchschnittliche Verweildauer pro Pub in der Sitzung sinkt um ≥ 30 % vs. vorher.
- Niemand klickt mehr „in MeisterTask öffnen", um eine Decision zu spiegeln (= das Tool ist die Single Source of Truth für Triage-Entscheidungen).

Phase A hat keine User-Metrik; der Erfolg ist „nichts kaputt, schneller refetch nach Enrich/Analysis-Modal".

## 13. Offene Calibration-Punkte (Default-Annahmen, gerne korrigieren)

1. **`decided_by` als Freitext-`text`**, nicht User-FK. Memory + aktueller Code haben kein User-Konzept; Freitext „team"/„marie" reicht. Bei späterer Auth: einfache Erweiterung.
2. **Sitzung als eigene Tabelle, NICHT als Sub-Concept einer „Cycle"-Entität.** Linear's Cycles wäre overengineered für ein Wochen-Meeting.
3. **Decision-Default `undecided` für ALLE alten Pubs.** Nach Migration sind ALLE Pubs in der Triage-Queue. Falls das zu groß ist: cutoff bei `published_at >= '2026-01-01'`.
4. **Flagging als Counter + JSONB-Notes**, kein per-User-Tracking. Falls per-User-Auth später: Migration auf `flagged_by_user uuid[]`.
5. **`/researchers` löschen statt demoten?** Default: Demotion zu Panel auf Dashboard. Wenn das Beeswarm nie genutzt wurde, einfach weg.
6. **„Briefing-Email" Phase D, nicht früher.** Adoption hängt davon ab, dass Decision-Capture etabliert ist.

## 14. Empfohlene Implementierungs-Reihenfolge

**Sprint 1 (1 Tag): Phase A1–A3 + A6.** DB-Migration, Refactoring der Konstanten, /analysis-Drop. Niedriges Risiko, legt Fundament.

**Sprint 2 (1 Tag): Phase A4 + A5 + A7 + A8.** Tailwind-Theme, TanStack Query, LoadingState-Konsolidierung, Header-Cleanup.

**Sprint 3 (2-3 Tage): Phase B.** Der eigentliche Sitzungs-Loop. Vor Sprint-Start einmal mit dem Team durchsprechen, ob die UX-Skizze stimmt.

**Test-Periode (2 Wochen):** Team nutzt /review für 2 Sitzungen.

**Sprint 4 (1-2 Tage): Phase C** — basierend auf realen Pain-Points, nicht auf Theorie.

**Sprint 5 (1 Tag): Phase D** — Briefing + Stats, sobald Phase B etabliert ist.

**Phase E:** kein Sprint-Slot, separate Plan-Iteration sobald MeisterTask-Migration ansteht oder Story-Bundles akut werden.

## 15. Recherche-Grundlage

Drei parallele Research-Agents am 2026-05-04, plus direktes UI-Audit aller bestehenden Seiten.

**UI-Library-Landschaft (verifiziert via GitHub):**
- shadcn/ui CLI v4 + Base UI variant, Sidebar v2, Mail-Beispiel (Folder/List/Detail)
- shadcn-Registry: openstatus/data-table-filters, Bazza UI, Kibo UI, Origin UI, Jolly UI
- TanStack Table v8 + Virtual + Query v5
- Tremor Raw, react-resizable-panels, sonner, vaul, cmdk, motion v12

**Plattform-Patterns:**
- Linear (Triage / Peek-on-Space / Triage Intelligence / Cycles / G-prefix-nav)
- Superhuman (3-Frage-Triage / J/K + E + H / Free-Text-Snooze)
- Raycast (Action Panel / `Cmd+K` while-in-row)
- Vercel (Geist-Skala / Resizable Sidebar / Skeletons)
- GitHub (Filter-Token-Syntax mit AND/OR/Klammern)
- Reader by Readwise (Inbox/Later/Archive 3-State)
- NewsWhip Spike (Compact + Inline-Expand + Predicted-Trajectory + Briefing-Email)
- Muck Rack (AI Search Assistant / Media-List-Agent)
- Sanity Studio (Workflow-Plugin mit Per-State-Config)
- Cron / Notion Calendar (`S`-für-Schedule)

**Domain-spezifisch (Academic + PR-Comms):**
- Altmetric Explorer (Donut-Visualisierung mit Score-Center, Saved-Search-Email-Digest, 7-Tab-Layout)
- Semantic Scholar (TLDR-Card direkt unter Titel, Highly-Influential-Citations-Badge, Skimming-Highlights, Citation-Intent-Klassifizierung)
- Dimensions.ai (FCR-Benchmark-Ratio, Inline-Donut-pro-Row, Analytical-Views-Tab)
- OpenAlex (Filter-Chip-System, 4-Level-Topic-Taxonomy, Plus-Button-Filter-Picker)
- NewsWhip Spike Deep-Dive (Predicted-Interactions als Sparkline, Compact↔Expanded-Toggle, Velocity vs. Overperforming als getrennte Metriken)
- CisionOne (React Score mit One-Click-Override, Sentiment + Emotion + Sarkasmus-Chips)

---

*Dieses Dokument ist Single-Source-of-Truth für die UX-Roadmap. Änderungen bitte hier eintragen, statt parallele Pläne zu starten.*
