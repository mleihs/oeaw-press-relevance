# Forscher:innen-Ansicht — Implementierungsplan

Stand: 2026-04-28. Status: **ausgeliefert** (Phasen 1–7 + Erweiterungen).

## Ziel

Pressestelle braucht eine UI, die Forschende ranked, die in den letzten N Monaten presserelevante Publikationen produziert haben. Default-Metrik: Anzahl Pubs mit `press_score ≥ 0.7` in 12 Monaten. Ergänzend: Spotlight Top 3, Verteilungs-Beeswarm, Personen-Detailseite mit Activity & Co-Autor:innen.

## Leitprinzipien

1. **Postgres-Logik in Postgres.** Aggregation, Ranking, Trend-Δ, Sparklines, Top-Pub, Score-Bands, Co-Autor-Aggregat → alles in versionierten PG-Functions, aufgerufen via `supabase.rpc()`. Next-Routes sind Zod-Wrapper.
2. **Co-located Routing-Privates** (`_components`, `_hooks`, `_filters`, `_types`) wie bei `app/publications/`.
3. **Server-aggregiert, Client-nuqs-gefiltert.**
4. **Keine Materialized Views im MVP** — Indices reichen bei 37k Pubs / 48k Junction-Rows.

## DB-Layer (Phase 1)

### Indices (Migration `20260428000002_researchers_indices.sql`)

`person_publications(publication_id)` existiert (`idx_person_pubs_pub`). Junction-Joins abgedeckt.

Neu: partieller Composite-Index auf `publications(published_at, press_score)` WHERE `analysis_status='analyzed' AND press_score IS NOT NULL` — trifft den Window-Scan-Hot-Path und schließt 36k irrelevante Rows aus dem Index.

### Functions (Migrationen `…_function.sql`)

Drei `LANGUAGE sql STABLE` Functions, alle mit demselben Filter-Set:

```
top_researchers(p_since date, p_metric text, p_authorship_scope text,
                p_oestat3_ids text[], p_include_external bool,
                p_include_deceased bool, p_member_only bool,
                p_min_value numeric, p_limit int)
  → rank_now, delta_count_high, is_newcomer, person fields,
    member_type_de, count_high, sum_score, avg_score, pubs_total,
    self_highlight_count, top_pub jsonb, sparkline jsonb (12 Monatswerte)

researcher_distribution(<gleiches Filter-Set>, p_limit int=500)
  → person_id, lastname, oestat3, metric_value, pubs_total, is_member

researcher_detail(p_person_id uuid, p_since date)
  → person jsonb, stats jsonb, activity jsonb (24 Monate × Score-Bands),
    coauthors jsonb (top 10), publications jsonb
```

**Kritische SQL-Pattern:**

- `CASE p_metric WHEN 'count_high' THEN ... END` für dynamische Sortier-/Filter-Metrik (kein SQL-Injection-Vektor, weil Identifier-frei)
- `RANK() OVER (...)` statt `ROW_NUMBER()` für ehrliche Tie-Behandlung
- `LATERAL` für Top-Pub und Sparkline nach `LIMIT` → spart Subquery-Aufrufe
- `WITH ... AS MATERIALIZED` im Detail, weil `window_pubs` 4× referenziert wird
- Authorship-Scope: `'lead'` = `pp.authorship IN ('HauptautorIn', 'AlleinautorIn')`, `'all'` = beliebig (auch NULL)
- Member-Filter: `pr.member_type_id IS NOT NULL` (NICHT `mahighlight` — siehe `mahighlight_semantics.md`)

## API-Layer (Phase 2-3)

| Route | Function | Verwendung |
|---|---|---|
| `GET /api/researchers/top` | `top_researchers` | Spotlight + Leaderboard |
| `GET /api/researchers/distribution` | `researcher_distribution` | Beeswarm |
| `GET /api/persons/[id]` | `researcher_detail` | Detailseite |

Wrapper sind ~10 Zeilen: Zod-Validierung der Query-Params → `supabase.rpc(...)` → Response.

## UI-Layer (Phase 2-7)

### Datei-Struktur

```
app/researchers/
├── page.tsx                       # Spotlight + Tabs[Rangliste|Verteilung]
├── _components/
│   ├── spotlight-podium.tsx
│   ├── leaderboard-table.tsx      # custom + motion.layout
│   ├── beeswarm-view.tsx          # SVG + d3-force
│   ├── filters-bar.tsx            # nuqs-bound
│   ├── person-avatar.tsx          # Portrait | Initialen-Bubble (HSL hash)
│   ├── sparkline.tsx              # 60×16 SVG mit stroke-draw-Animation
│   └── trend-delta.tsx            # ▲ 3 / ▼ 2 / NEU
├── _hooks/
│   ├── use-leaderboard.ts
│   └── use-distribution.ts
└── _filters.ts                    # nuqs parsers

app/persons/[id]/
├── page.tsx
└── _components/
    ├── person-header.tsx
    ├── activity-chart.tsx         # Recharts BarChart, Score-Bands gefärbt
    ├── coauthor-block.tsx         # Avatar-Stack
    └── pub-list.tsx

lib/researchers.ts                 # shared TS types
```

### Tech-Stack

- **shadcn/ui**: bestehend + neu installiert: `Avatar`, `HoverCard`
- **motion** v12 (Modul `motion/react`, ~30 KB gz): `layout`-Prop für FLIP, `AnimatePresence` für Spotlight-Stagger
- **motion-number** (~2.5 KB): animierter Score-Counter im Spotlight
- **d3-force** (~6 KB): Beeswarm-Kollisions-Layout (12 Iterationen vorab, dann statisch)
- **Eigenbau**: HSL-Avatar-Hash (15 LoC), Sparkline (40 LoC)

### Wow-Schicht

- Spotlight: Newsreader-Serif für Top-Pub-Titel (Wiedererkennung zum Haiku!), motion-number ticker beim Scroll-into-view, Stagger 0/120/240 ms
- Leaderboard: Filterwechsel triggert `motion.layout` FLIP-Reorder
- Sparkline: stroke-dashoffset draw-in, 1.2s ease-out, beim Mount
- Beeswarm: HoverCard mit Mini-Sparkline, Klick → Detail-Route
- Alles respektiert `prefers-reduced-motion`

## Phasen

1. **Foundation** — Schema-Verifikation, 4 Migrationen, EXPLAIN-Benchmark
2. **Skelett** — Deps, Types, API-Wrapper, Primitives, FiltersBar, Tabelle (statisch)
3. **Spotlight** — SpotlightPodium, Top 3 Hero
4. **Beeswarm** — d3-force, HoverCards, Tab
5. **Wow** — motion.layout, motion-number, Sparkline-Draw, Stagger
6. **Detail** — `/persons/[id]` Page mit Activity-Chart, Coauthors, Pub-Liste
7. **Politur** — Nav-Eintrag, Empty-States, Methodik-Tooltips, Mobile

## Bewusste Entscheidungen

- **Threshold 0.7 hardcoded im MVP.** Konfigurierbar in v1.1.
- **oestat3 als Sektions-Attribut**, nicht orgunit (oestat3 ist sauber pro Person).
- **Top 50 Cap**, keine vollständige Rangliste — kein „Anpranger"-Effekt.
- **DORA**: Spaltentitel „Press-Aktivität" + „Hochbewertete Pubs" (nicht „Best Researcher"). Methodik-Tooltip Pflicht.
- **`mahighlight` raus aus Filtern** — empirisch 90 % von Nicht-Mitgliedern gesetzt; korrekter Mitglieds-Filter ist `persons.member_type_id IS NOT NULL`.
- **Featured-Override** (`persons.featured_until`) deferred zu v1.1.

## Was nach dem ursprünglichen Plan ergänzt wurde

- **`weighted_avg`-Metrik** (Migration `…_008_…weighted_avg.sql`): Bayessche Glättung nach IMDb-Formel `(n·avg + 3·prior) / (n+3)`, Prior selbstkalibrierend aus aktuellem Filter-Scope. Verhindert 1-Pub-Wonder-Verzerrung bei Avg-Sortierung. Als 5. Metrik im Dropdown verfügbar; rohes `avg_score` bleibt zur Transparenz erhalten.
- **ITA-Filter** (Migration `…_006_…exclude_ita.sql`): `p_exclude_ita boolean DEFAULT true`. Recursive CTE auf `orgunits.akronym_de='ITA'` + Subtree, JOIN gegen `orgunit_publications`. Filtert ITA-Dossiers (eigene Pop-Sci-Outreach-Reihe) standardmäßig aus.
- **Outreach-Filter** (Migration `…_007_…exclude_outreach.sql`): `p_exclude_outreach boolean DEFAULT true`. Filtert Pubs mit `publication_type = 'aufwändige Multimedia-Publikation'` (Pragmaticus/Hiccup-Podcasts). UI-Toggles für beide.
- **Citation in JSONB** (Migration `…_009_…citation_field.sql`): `top_pub` und `publications`-Liste enthalten jetzt `citation`, damit `displayTitle()`-Heuristik auch in Spotlight, Leaderboard-Subtitle und Person-Detail-PubList die WebDB-abgeschnittenen Titel ergänzen kann (z.B. „Wissenschaftliche Zusammenfassung" → AAR2-Klimabericht-Vollkontext).
- **InfoBubble-System** (`components/info-bubble.tsx`, `lib/explanations.tsx`): zentrale `EXPL`-Map mit 31 strukturierten Erklärungen (title/formula/body/example/note), gerendert via Hybrid-Trigger (Hover + Touch-Tap + Click-Pin + Keyboard-Focus, Pointer-Detection per Media-Query). Globaler Toggle in der Nav, persistiert in localStorage, cross-tab synchronisiert. Verdrahtet an allen Metriken/Badges/Filtern auf 5+ Seiten.
- **Hybrid-Filter-Pattern** (`app/publications/page.tsx`): Linear-/Notion-Style. Presets gelten als Views — beim Switch werden NUR Preset-Territory-Felder zurückgesetzt, Modifier (Suche, oestat, Datum, …) survive. „Modifiziert · zurücksetzen"-Pille bei Abweichung. Empty-State mit One-Click-Recovery-Aktionen.
- **`displayTitle()`-Heuristik** (`lib/html-utils.ts`): WebDB-Import schneidet Titel am ersten Doppelpunkt; voller Titel steckt nur in `citation`. Konservative Extension nur bei exaktem `<title>:`-Prefix-Match. Angewandt im Dashboard, der Pub-Tabelle, der Pub-Detail-H1, dem Spotlight, der Person-Detail-PubList.
- **Renames** für semantische Korrektheit:
  - HeboWebDB → WebDB überall: Source-Tag wurde 2026-05-05 von `'hebowebdb_summary'` zu `'webdb_summary'` umbenannt (Code + DB-Migration), Label ist „WebDB".
  - „Akademie-Highlights" → „Eigen-Highlights" (90 % der mahighlights stammen empirisch von Nicht-Mitgliedern, siehe Memory `mahighlight_semantics.md`)
- **Haiku-Block-Position**: aus dem Analyse-Card raus, eigene Card direkt unter „Zusammenfassung" auf der Pub-Detail-Seite. Newsreader-Serif, Editorial-Luxe-Layout. Prompt aktualisiert: „echte Umlaute, kein ae/oe/ue/ss".
- **Lead-Autor:in-Verlinkung** im Pub-Detail: Header-Meta-Zeile linkt jetzt auf `/persons/[id]` via Namens-Match gegen `authors_resolved`.
