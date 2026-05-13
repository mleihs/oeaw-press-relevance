# Architecture Hardening Plan — Post-Phase-3

**Stand:** 2026-05-12
**Status:** Plan, noch nicht begonnen
**Vorgänger:** `OSS_READINESS_PLAN.md` (Phasen 1–3 done; Phase 4 = Vitest noch offen)
**Branch:** `refactor/drizzle-press-releases` (oder `main` nach Merge)

Fünf gezielte Architektur-Hebel **nach** Phase 3 (Drizzle-Migration). Ziele:
1. Drizzle-Codebasis Phase-4-fähig machen (mockbar, repository-layered).
2. Cross-Feature-Operationen (Triage-Flow) klarer schneiden.
3. Server-Rendering wo es kostenlos schneller ist.
4. Story-Bundles als Feature-Hebel für Find→Ship-Loop.
5. ADRs als Dokumentations-Anker für OSS-Contributors.

Reihenfolge ist **load-bearing**: 7 → 2 → 1 → 4 → 6. Jede Phase baut auf der
vorigen. Pro Phase: Plan-OK, dann Implementation am Stück (per memory
`feedback_apply_pacing.md`), Block-Status statt File-für-File-Approval.

---

## Inhaltsverzeichnis

1. [Phase A7 — Architectural Decision Records](#phase-a7--adrs)
2. [Phase A2 — Repository-Layer für Drizzle](#phase-a2--repository-layer)
3. [Phase A1 — Domain-Module statt feature-flach](#phase-a1--domain-module)
4. [Phase A4 — Server-Components für read-heavy pages](#phase-a4--server-components)
5. [Phase A6 — Story-Bundles via pgvector-Clustering](#phase-a6--story-bundles)
6. [Cross-cutting: Wo Phase 4 (Vitest) reinpasst](#cross-cutting-vitest)
7. [Wie hier nach /clear weitermachen](#wie-hier-nach-clear-weitermachen)

---

## Phase A7 — ADRs

**Status:** [x] done 2026-05-12 (commit pending — see end of phase).
**Aufwand:** ~3h.

### Goal
Lightweight Architectural Decision Records (MADR-Format) im neuen Ordner
`docs/adr/`. Backfill der existierenden großen Entscheidungen +
Template für künftige.

### Why
Aktuell stehen die Architektur-Calls verteilt in: `OSS_READINESS_PLAN.md`
(Phasen-Plan), `phase3_handover.md` (Memory), `docs/IMPLEMENTATION.md`
(Implementation-Snapshot), `eslint.config.mjs` (Inline-Kommentare). Für
OSS-Contributors: zu viele Quellen, kein "Warum war das so?". Phase-3 hat
selbst zwei Bug-Klassen erzeugt, weil die "Warum"-Memory bei den
Phase-3-Commits nicht greifbar war (Array-Binding, Relation-Shadowing).
ADRs sind genau dieser Permanent-Anker.

### Scope
**In:** `docs/adr/0000-template.md` + die 7 Backfill-ADRs unten. Markdown
mit YAML-Frontmatter (date, status, deciders, supersedes).

**Out:** Tooling (kein `adr-tools` CLI), keine Auto-Generation, kein
Index-Generator. `docs/adr/README.md` als manuelle Liste reicht.

### Sketch
```
docs/adr/
├── README.md                                    # Liste + Konventionen
├── 0000-template.md                             # MADR-Template
├── 0001-drizzle-over-prisma-and-raw-sql.md
├── 0002-supabase-js-only-for-auth-realtime.md
├── 0003-per-feature-toapi-not-generic-serializer.md
├── 0004-snake-case-iso-8601-wire-shape.md
├── 0005-sql-functions-stay-in-postgres.md
├── 0006-lib-server-shared-client-boundaries.md
└── 0007-local-canonical-for-analysis-data.md
```

Jede ADR ~30 Zeilen: Context (Problem), Decision, Consequences (+/-).
Verweise auf den Original-Commit oder die Memory-Datei wo die Decision
fiel.

### Acceptance Criteria
- [x] `docs/adr/README.md` listet alle ADRs mit One-Liner-Hook (Index-Tabelle
      + Konventionen + "When to write an ADR")
- [x] Template-File mit kommentierten Slot-Beschreibungen
      (`docs/adr/0000-template.md`)
- [x] 7 Backfill-ADRs geschrieben, jede unter 50 Zeilen
      (0001 Drizzle / 0002 Supabase-JS-scope / 0003 per-feature-toApi /
      0004 wire-shape / 0005 SQL-functions / 0006 lib-boundaries /
      0007 local-canonical)
- [x] `OSS_READINESS_PLAN.md` (§6 + §7) und `docs/IMPLEMENTATION.md`
      (top-of-doc + §1 + §5) verlinken die relevanten ADRs als
      kanonische Quelle, ohne die Begründung zu duplizieren
- [x] Lint/Test bleiben grün (no source change) — 0 errors / 14 warnings
      / 40 tests, Baseline unverändert

---

## Phase A2 — Repository-Layer

**Status:** [x] done 2026-05-12 (commit pending — see end of phase).
**Aufwand:** ~5h.

### Goal
Dünne `lib/server/repos/<entity>.ts` Schicht zwischen Drizzle-Queries und
Business-Logic. Kein Aktiv-Record-Smell — nur Query-Builder-Kapselung +
Mapping. Macht Phase-4 Vitest sauber mockbar (pg-proxy Adapter pro Repo).

### Why
Heute mischen `list.ts`, `queue.ts`, `decisions.ts` etc. SQL-Builder + Map
+ Business-Logic in einer Datei. Pro Phase-3-Lessons:
- Latente Drizzle-Quirks (sql.param, Relation-Shadowing) blieben unentdeckt,
  weil keine isolierte Test-Surface für reine Queries existiert.
- Phase-4 will pg-proxy mocken (docs/TESTING.md §2.1), das ist mit dem
  jetzigen Layout schwierig: man müsste die ganze list.ts intercepten.

Mit Repos: `publicationsRepo.findManyForList(filters)` ist eine reine
DB-Funktion, die Business-Logic in `list.ts` ruft sie auf, der Test
mockt nur den Repo.

### Scope
**Iterativ, nicht symmetrisch.** Repo nur dort einführen, wo zwei oder
mehr files dieselbe Drizzle-Query duplizieren ODER ein Test ihn explizit
braucht. Symmetrische "alle Entities kriegen einen Repo"-Layer ist
Cargo-Cult; macht die Code-Surface größer ohne Test-Vorteil.

**In (Pflicht):**
- `lib/server/repos/publications.ts` — am stärksten dupliziert
  (list.ts, queue.ts, fetch.ts, decisions.ts, flag.ts greifen alle auf
  publications zu). Höchster ROI.
- `lib/server/repos/embeddings.ts` — wird in A6 (Stories) wieder
  gebraucht, also zwei Konsumenten → Repo rechtfertigt.

**Pflicht-Bewertung pro weiterer Entity (orgunits, sessions,
press-releases, lookups):**
Wenn nur EIN call-site existiert ODER die Query trivial ist
(`db.select().from(t).orderBy(...)`) → KEIN Repo, bleibt inline.
Sonst → Repo.

**Out:**
- SQL-Function-Wrappers (top_researchers, publication_dashboard_stats,
  similar_pressed_pubs) bleiben Inline in den Routes — die sind ohnehin
  schon dünne Adapter und ein Repo dazwischen wäre Pure-Indirection.
- Transactions noch nicht generisch — wenn brauchen, dann via
  `db.transaction(tx => ...)` direkt im Business-Code (selten).

### Sketch
```typescript
// lib/server/repos/publications.ts
import { eq, inArray, sql, type SQL } from 'drizzle-orm';
import { db, publications, type PublicationsTable } from '@/lib/server/db';

export type PublicationRow = typeof publications.$inferSelect;

export const publicationsRepo = {
  async findById(id: string): Promise<PublicationRow | null> {
    const [row] = await db.query.publications.findFirst({
      where: eq(publications.id, id),
      with: {
        publicationTypeRef: true,
        pressReleases: true,
        personPublications: { with: { person: true } },
        orgunitPublications: { with: { orgunit: true } },
        publicationProjects: { with: { project: true } },
      },
    });
    return row ?? null;
  },

  async findManyForList(opts: {
    where?: SQL;
    orderBy: SQL;
    limit: number;
    offset: number;
    embedOrgunitWhere?: SQL;
  }): Promise<ListRow[]> { /* ... */ },

  async countWhere(where: SQL | undefined): Promise<number> { /* ... */ },

  async updateDecision(id: string, payload: DecisionPayload): Promise<PublicationRow> { /* ... */ },
} as const;
```

Business-Logic-Files (`list.ts`, `fetch.ts`, `decisions.ts`, `queue.ts`)
delegieren ihre DB-Calls an den Repo. Wire-shape-Mapping
(`publicationToApi`) bleibt in `to-api.ts` — Repos geben Drizzle-Rows
zurück, nicht DTOs.

### Acceptance Criteria
- [x] 1 Repo-File mit klaren primitive-Operationen
      (`lib/server/repos/publications.ts`, 14 Methoden — Lookups +
      Counts + 5 Filter-ID-Sets + 4 Mutations). Pflicht-Bewertung der
      übrigen Entities ergab: **embeddings → skip** (0 TS-Konsumenten
      heute, A6-Future), **orgunits/press-releases/sessions/lookups →
      skip** (1 call-site bzw. trivial-Drizzle). Symmetrie ist
      Cargo-Cult; siehe `lib/server/repos/README.md`.
- [x] `list.ts`, `queue.ts`, `fetch.ts`, `decisions.ts`, `flag.ts` rufen
      Pubs-Queries nur noch über `publicationsRepo` auf. Keine direkten
      `db.query.publications.*` mehr. Cross-feature Sessions-Read in
      queue.ts wurde nach `sessions/lifecycle.ts::getLatestSessionTimestamp`
      verschoben (Bonus-Code-Smell-Fix).
- [x] `db` Singleton-Import bleibt erlaubt für SQL-Functions
      (`db.execute(sql...)`) und feature-eigene Trivial-Reads
      (`queue.ts::fetchFreshHighScoreIds`, `list.ts::fetchBadTypeIds`).
      Repo ist nur für duplizierte Drizzle-Builder.
- [x] Smoke-Test persistent committed: `scripts/smoke/repos/publications.ts`
      (read-only, exercises every method's branches incl. sql.param
      array-binding gotcha + relation-shadow guard).
- [x] Lint 0/14, tsc clean, npm test 40+ green — Baseline gehalten.
- [x] Documentation: `lib/server/repos/README.md` mit "Was gehört hier
      rein, was nicht" + Entity-Tabelle + Drizzle-Gotcha-Liste.
- [x] **Bonus:** `descNullsLast` / `ascNullsLast` Helper in
      `lib/server/db/sort.ts`. Kapselt den Drizzle-`desc()`-NULLS-LAST-
      Gap (Memory `phase3_handover.md` call #6). Refactored 8 Call-Sites
      in list/queue/enrichment/analysis/exports/smoke — `sql\`${col}
      DESC NULLS LAST\`` taucht in App-Code nicht mehr auf.

---

## Phase A1 — Domain-Module

**Status:** [x] done 2026-05-12 — three domain splits **skipped** after
audit (no concrete smell), one real `toApi`-duplication fix landed.
See [ADR 0008](docs/adr/0008-domain-modules-deferred.md) and the
section below for full rationale. **Aufwand:** ~1.5h. **Voraussetzung:**
A2 done = met.

### Audit verdict (2026-05-12)

Per the plan-warning ("NIEMALS Form-folgt-Funktion ohne dass sich ein
konkretes Code-Smell auflöst") and the Phase-A2 maxim ("threshold is
real smell, not symmetry"), each proposed domain was assessed:

- **`triage/` skipped.** `publications/decisions.ts::applyDecision`
  already orchestrates `repo.updateDecision` + `pushPublicationToMeisterTask`
  in a 34-line function. The decision-route PATCH handler is a 30-line
  thin adapter — already at the plan's `<30 LOC` target. Session
  lazy-create lives **client-side** (per-tab localStorage in
  `lib/client/stores/session-store`); moving it server-side would
  require sharing session state across requests (cookie or header) —
  an architectural shift, not a refactor. `meistertask/push.ts` is
  also called by the manual `/api/meistertask/push` route, so it
  stays in `meistertask/`.

- **`pipeline/` skipped.** `Publication['enrichment_status']` and
  `Publication['analysis_status']` are already typed unions
  (`lib/shared/types.ts:20`). No invalid-transition bug exists. A
  proposed `transitionPub(id, target)` would have to either splice
  each pipeline write into two queries (status + result fields) or
  duplicate the `db.update().set({...})` shape — both worse than the
  current inline writes. `enrichment/batch.ts` and `analysis/batch.ts`
  are already the per-feature orchestrators.

- **`coverage/` skipped.** `promote_press_release_orphans_logged()`
  is a SQL function (ADR 0005). Today's two callers
  (`scripts/webdb-import.mjs`, `scripts/enrich-orphans.ts`) use raw
  `pg.Client`, can't import `lib/server/` cleanly (would mix two
  Postgres clients in one process). No admin route exists; a TS
  wrapper would have zero TS consumers today.

### Real smell fixed

`lib/server/press-releases/list.ts::toApi` was a **24-LOC exact
duplicate** of `pressReleaseToApi` (then in `publications/to-api.ts`).
Per ADR 0003 ("per-feature toApi") and the explicit comment in the
old `publications/to-api.ts` ("when press-releases grows its own
helper, decide whether to extract or duplicate"), the canonical
mapper now lives **entity-owned** in
`lib/server/press-releases/to-api.ts`. Both `publications/fetch.ts`
and `publications/list.ts` import it from the new location.
Dev-verified `/api/press-releases?stats=true`, `?orphans=true`,
`?with_pub=true` — all three paths return identical JSON.

### Acceptance Criteria

- [x] Audit performed against the three proposed domains; per-domain
      skip rationale documented in **ADR 0008** and the section above.
      No Form-folgt-Funktion extractions.
- [x] Real `toApi`-duplication in `press-releases/list.ts` removed;
      canonical `pressReleaseToApi` extracted to entity-owned
      `lib/server/press-releases/to-api.ts` per ADR 0003. Consumers
      (`publications/{fetch,list}.ts`, `press-releases/list.ts`)
      import from the new location.
- [x] Lint baseline preserved: **0 errors / 14 warnings**. Typecheck
      clean. `npm test` → 40/40 green.
- [x] Dev-verify on all three `/api/press-releases` paths (gate cookie):
      `stats=true` → counts, `orphans=true` → null-pub rows,
      `with_pub=true` → joined-publication rows.
- [x] `lib/server/repos/README.md` carries a new "Why no triage/,
      pipeline/, coverage/" section pointing to ADR 0008 — same
      disciplinary pattern as the entity-by-entity skip table.

---

## Phase A4 — Server-Components

**Status:** [x] **Pilot done 2026-05-12** on `/persons/[id]` +
**Phase 1 page `/publications/[id]` done 2026-05-12** +
**Phase 1 page `/press-releases` done 2026-05-13** as **Zero-JS RSC**
(Phase 1 closed). Pilot validated: TTFB-Win + zero hydration-mismatch.
Phase-1 `/publications/[id]` validated: first mutation-bearing RSC
page in the codebase + ADR 0010 (props + `router.refresh()`) closes
the ADR-0009 open question on mutation flow. Phase-1 `/press-releases`
validated: first list page taken to **max-RSC** — `<Link>`-based tab
navigation replaces shadcn `Tabs`, native `<details name=>` replaces
the `useState` row-expand toggle, zero `'use client'` in the page tree
itself. The migration also surfaced the **pilot-vs-max-RSC
discriminator** (see phaseA4 Lesson #21) and fixed a latent
camelCase/snake_case bug the previous `as unknown as` cast masked.
See [ADR 0009](docs/adr/0009-rsc-server-components-pilot.md),
[ADR 0010](docs/adr/0010-rsc-mutation-router-refresh.md), pilot closeout
below, and the phase-1 Acceptance checkboxes. **Only Phase 2
(`/`, `/publications` list) pages remain.** **Aufwand pilot:** ~3h;
**phase-1 `/publications/[id]`:** ~3h; **phase-1 `/press-releases`:**
~5h (incl. Zero-JS refactor following fresh-eyes self-review).
**Voraussetzung:** A2 done (Repos sind das, was RSCs sauber aufrufen
können — `useApiQuery` wird durch direkte Repo-Calls ersetzt).

### Goal
Pages mit hauptsächlich read-only Initial-State zu Server Components
machen. Mutations + URL-Filter-State bleiben Client-Components.
Spart 200-800ms initial paint, eliminiert eine Roundtrip-Klasse, macht
SEO-/Preview-Sharing möglich.

### Why
Aktuell: jede Page ist `'use client'`, fetched per `useApiQuery` → 3-7
Roundtrips bis das Initial-View steht. /publications/[id] zum Beispiel:
GET HTML → GET /api/publications/[id] → GET /api/publications/[id]/similar-pressed
→ GET /api/sessions/recent.

Mit RSC: HTML enthält die Daten schon serverseitig gerendert.
TanStack-Query bleibt nur für Mutations + Streaming
(Enrichment/Analyse-SSE).

### Scope

**Stufenweise — Experiment-first.** Erst EINE Page komplett migrieren
und in Production-ähnlichem Setup validieren (TTFB-Vergleich,
Hydration-Mismatch-Check, devtools-Panel sauber), bevor weitere
nachgezogen werden. Wenn TanStack-Query-Hydration zickt — abbrechen,
Lessons als ADR festhalten, Phase A4 als "nicht-machbar im jetzigen
Stack" markieren.

**Pilot (1 Page):**
- [x] `/persons/[id]` (Researcher-Detail) — einziger RPC-Call, Single
      `useApiQuery`, keine Filter, keine Mutations: kleinster Blast-Radius.
      **Landed 2026-05-12.** Page is now an `async function` server-component
      that calls `lib/server/researchers/detail.ts::getResearcherDetail`
      directly. Client subtree (`_components/detail-client.tsx`) receives
      the `ResearcherDetail` row as a prop — no TanStack-Query hydration
      boundary (per ADR 0009). New `error.tsx` + `not-found.tsx` replace
      the inline `ApiErrorCard` / `EmptyState` branches the old client
      page carried. `/api/persons/[id]` route now also delegates to
      `getResearcherDetail` (single source of truth for the
      `researcher_detail()` SQL function). Smoke under
      `scripts/smoke/rsc/persons-detail.ts`. ESLint rule
      `from: "app-pages", allow: [..., "server"]` enabled — see ADR 0009.

**Phase 1 (nach Pilot-Validation, klare Wins):**
- [x] `/publications/[id]` (Detail) → RSC für Pub-Daten, similar-pressed
      bleibt Client-Card (lazy). **Landed 2026-05-12.** Page is now an
      `async` server-component calling
      `lib/server/publications/fetch.ts::getPublicationById` directly
      (refactored to return `PublicationWithRelations | null` so the RSC
      can `notFound()` and the route handler can map to 404). Client
      subtree lives in `_components/detail-client.tsx`; `Breadcrumb`
      extracted to `_components/breadcrumb.tsx` and shared by the page,
      `error.tsx`, and `not-found.tsx` (same A1/pilot pattern as
      `back-link.tsx`). Mutation flow is the new piece: `DecisionToolbar`
      and `PublicationFlag` now call **both** `invalidateQueries(...)`
      AND `router.refresh()` on success — Option A, codified as
      [ADR 0010](docs/adr/0010-rsc-mutation-router-refresh.md). Smoke at
      `scripts/smoke/rsc/publications-detail.ts`.
- [x] `/press-releases` (List) → **Zero-JS RSC**. **Landed 2026-05-13.**
      Page is an `async` server-component reading `?tab=` from
      `searchParams` (validated via the `isTab` type predicate exported
      from `_components/tabs-nav.tsx`), fetching stats + active tab's
      list in parallel from `lib/server/press-releases/list.ts`. **Render
      tree is fully RSC**: stats / tabs-nav / main-table / orphans-list
      each in their own server component under `_components/`. Tab
      navigation uses `<Link replace scroll={false}>` in a `<nav>`
      (no `useRouter`, no shadcn `Tabs` primitive); orphan-row
      expansion uses native `<details name="orphan-detail">` (no
      `useState`, browser-managed mutex). The page ships **zero
      page-specific client JavaScript**; only the shared design-system
      components (`StatCard` with `animate={false}`, `PressScoreBadge`,
      `SimilarityIndicator`, `DecisionBadge`) hydrate as small islands.
      No mutations → ADR 0010 untouched. `error.tsx` kept for
      consistency with detail-page error UX. Smoke at
      `scripts/smoke/rsc/press-releases.ts` — also catches a latent
      camelCase/snake_case bug the pre-cleanup `as unknown as` cast in
      `list.ts` had masked (fixed in the same pass; see phaseA4
      Lessons #21 + #22).

**Phase 2 (komplexer, evaluieren):**
- [ ] `/` (Dashboard) — hat aktuell Realtime-Pulse Animationen,
      Hybrid-Pattern probieren
- [ ] `/publications` (List) — heavy nuqs filter state, könnte
      `searchParams` props nutzen statt Client-Side-URL-Parse

**Explicit out:**
- `/review` bleibt Client (Triage ist mutation-heavy, TanStack-Query
  Invalidation > RSC-Revalidation für UX)
- `/upload` bleibt Client (Streaming-SSE während Import)

**Cross-cut:**
- `useApiQuery` bleibt für Client-Components die filter/sort-state aus URL
  brauchen
- `lib/server/repos/*` ist die einzige Schicht die RSCs aufrufen — nicht
  Drizzle-`db` direkt (Konsistenz mit Routes)

### Sketch
```tsx
// app/publications/[id]/page.tsx — RSC
import { publicationsRepo } from '@/lib/server/repos/publications';
import { publicationToApi } from '@/lib/server/publications/to-api';
import { PublicationDetailClient } from './_components/detail-client';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await publicationsRepo.findById(id);
  if (!row) notFound();
  return <PublicationDetailClient initial={publicationToApi(row)} />;
}
```

`PublicationDetailClient` (`'use client'`) bekommt initial-data als prop,
TanStack-Query hydratisiert davon, Mutations laufen wie heute.

### Acceptance Criteria (pilot pass — full phase still open for Phase 1+2 pages)
- [x] **Pilot page** `/persons/[id]` HTML TTFB warm dev = **~165ms**
      (baseline HTML+API: ~125ms + ~70ms with a `"Lade Profil …"`
      flicker between). Eliminated roundtrip + skeleton-flicker; data
      now ships embedded in the initial HTML. Production TTFB will be
      lower than dev's; pilot threshold of "no regression + roundtrip
      eliminated" met.
- [x] No new `'use client'` leaks via eslint-boundaries — lint baseline
      preserved (0 errors / 14 warnings). The new `app-pages → server`
      allowance (ADR 0009) was explicitly chosen, not accidental.
- [x] Playwright e2e (`person detail (activity chart) — light/dark`)
      passes. Zero `pageerror` events. No timing-assert adjustment
      needed — the existing `networkidle + 2s hydrate` window already
      accommodates the (faster) RSC path.
- [x] Cache-strategy documented — [ADR 0009](docs/adr/0009-rsc-server-components-pilot.md):
      `force-dynamic` default for read-heavy admin pages, props (not
      `HydrationBoundary`) when the client neither refetches nor mutates.
- [x] Decision-Toolbar unaffected — `/persons/[id]` carries none;
      `/publications/[id]` + `/review` were not touched and remain
      Client Components with their existing mutation flow.

**Open for Phase 1 / Phase 2 pages above.** Each follow-up page repeats
the pilot recipe: thin `lib/server/<feature>/<name>.ts` wrapper +
`async` page + `'use client'` child for any subtree that needs hooks.

### Open Questions
- Wie viel ist Vercel-locked? Self-hosting-OSS: Node-Server kann RSC, OK.
- ~~TanStack-Query SSR-Hydration via `dehydrate`/`HydrationBoundary`~~ —
  **resolved by ADR 0009**: pass props for read-only pages; reserve
  `HydrationBoundary` for pages whose client tree mutates or refetches
  the prefetched cache.

---

## Phase A6 — Story-Bundles

**Status:** [ ] pending. **Aufwand:** ~18h. **Voraussetzung:** A2 (Repo
für embeddings + neuer stories-repo), A1 (`coverage/`-Domain als
Cluster-Refresh-Heimat).

### Goal
Aus dem Memory `story_bundles_proposal.md`: semantische Cluster
verwandter Pubs zu Themen-Bündeln. Hebel: aus der Solo-Pub-Triage wird
"Story-Triage" — Press kann mehrere Papers gleichzeitig anpitchen statt
sequentiell.

### Why
- Press-Eligibility kommt selten von Einzel-Papers, häufiger von
  Themen-Häufungen ("dieses Quartal kamen 5 Klima-Papers raus")
- Embedding-Daten + pgvector liegen bereits — Centroid + kNN sind
  trivial erweiterbar zu Clustering
- Memory `editorial_pipeline_proposal.md` nennt Stories als Top-2-Hebel
  hinter pitch_log

### Scope
**In:**
- DB-Schema: `stories` Tabelle (id, title, summary, created_at,
  centroid vector(768), member_count, status enum)
- `publication_stories` Join (publication_id, story_id, similarity,
  confidence enum)
- Clustering-Function: pgvector-DBSCAN oder HDBSCAN per SQL —
  recherche, sonst Python-Side via scripts/cluster-stories.py
- Routes: `/api/stories` + `/api/stories/[id]` + `/api/stories/cluster`
  (admin trigger)
- UI: `/stories` (List), `/stories/[id]` (Detail mit pub-members + Pitch-Workflow)
- Auto-Cluster nach jedem successful enrichment-batch

**Out:**
- Cross-language Clustering (SPECTER2 ist EN-trained, DE-Pubs eigenes
  Mini-Cluster oder rausnehmen)
- LLM-Story-Summaries first pass — `title` ist initial Hash der
  Top-3-Pub-Keywords, editorial UI editiert manuell

### Sketch (DB)
```sql
CREATE TABLE stories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  summary     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  centroid    vector(768),
  member_count INT NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','pitched','published','archived'))
);

CREATE TABLE publication_stories (
  publication_id UUID NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  story_id       UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  similarity     DOUBLE PRECISION NOT NULL,
  confidence     TEXT NOT NULL DEFAULT 'auto'
                   CHECK (confidence IN ('auto','manual')),
  PRIMARY KEY (publication_id, story_id)
);

CREATE INDEX stories_centroid_ivfflat
  ON stories USING ivfflat (centroid vector_cosine_ops);
```

### Sketch (Clustering)
**Default: SQL-only via pgvector + iterative Centroid-Build.** Self-
hoster bleiben dependency-frei (kein Python-Sidekick im Deploy). Python
nur dann, wenn SQL-Pipeline ungenügende Cluster liefert — dann eine
Architektur-Entscheidung-ADR die den Trade-off festhält.

SQL-Approach (Skizze):
1. Seed: pick the embedding furthest from any existing story-centroid
2. Expand: alle Pubs mit `1 - cosine_distance >= 0.82` zum Seed → neuer
   Story-Cluster, member_count berechnen
3. Iterate bis keine seed-fähigen Embeddings mehr (alle in einem
   Cluster oder explicit-skipped)
4. Recompute centroids als mean(member_embeddings) (vector
   AVG-Funktion in pgvector)

Threshold-Kalibrierung: kNN-mean von press_similarity (≈0.85 median bei
gepressten Pairs) als Baseline. Eps=0.82 ist konservativ (engere
Cluster, mehr Singletons).

Falls SQL-Clustering inadequat → Fallback:
```python
# scripts/cluster-stories.py
# Lädt publication_embeddings, läuft HDBSCAN, schreibt stories+joins.
# Idempotent — bestehende Stories werden via Centroid-NN matched.
```

### Acceptance Criteria
- [ ] Initial-Clustering läuft auf 38k Pubs in <10min
- [ ] /stories zeigt Cluster mit ≥3 Members sortiert by member_count
- [ ] /stories/[id] zeigt Member-Pubs mit individual similarity-to-centroid
- [ ] Pitch-Flow: Story → "Pitch all" pushed MeisterTask-Tasks gebündelt
      (eine Card pro Story, Pub-Links als Checklist)
- [ ] Cluster-Refresh läuft nach enrichment-batch ohne manuelle Trigger
- [ ] Edge-cases: zu-kleine Cluster (`member_count < 3`) status='archived'

### Open Questions
- HDBSCAN-Python-Dependency vs SQL-only-Clustering. Erstes ist
  Black-Box weniger transparent, zweites ist eigener Implementierungs-
  aufwand.
- Story → Person/Orgunit-Aggregation? "Welche Forscher:innen sind
  in dieser Story aktiv?"
- LLM-Story-Synthesis: Top-3-Pubs zu einem Pitch-Vorschlag verdichten —
  Memory `pitch_angle_craft.md` als Prompt-Grundlage

---

## Cross-cutting

### Vitest (= Phase 4 aus OSS_READINESS_PLAN.md §8) parallel zu A2/A1

- **Nach A2:** Erste Vitest-Specs pro Repo via pg-proxy.
- **Nach A1:** Domain-Tests (`applyDecision`, `transitionPub`,
  `promoteOrphans`) — die haben echten Business-Wert, im Gegensatz
  zu reinen CRUD-Tests.
- **Smoke-Tests committen:** `scripts/smoke/` ablegen, GitHub-Actions
  Cron pingt jede Nacht — würde die Phase-3-Bugs (uuid-Bind,
  Relation-Shadow) sofort gefangen haben.

### Error-handling helper (mit A2 ziehen)

Aktuell `try { ... } catch (err) { return apiError(err instanceof Error
? err.message : 'Unknown error', 500) }` in ~25 Routes dupliziert.
`lib/server/http.ts` hat schon `errorToApiResponse(err, status)` —
nutzen aber kaum jemand. Schritt eins: durchziehen. Schritt zwei:
`withApiError(handler)` Higher-Order-Function die das tryCatch
abstract — Routes werden einzeilig. Aufwand ~1h, Lessen ~50 LOC.

### Boot-time env validation

Phase 3 endete mit einer halben Stunde Debug, weil DATABASE_URL fehlte
und ein Drizzle-`postgres('')` cryptisch failed. `lib/server/env.ts`
mit zod-Schema das beim Boot alle erwarteten Vars validiert (DATABASE_URL,
SUPABASE_URL, GATE_TOKEN, MEISTERTASK_API_TOKEN, …). Bei Fehlen: Process
exitet mit klarer Liste fehlender Vars. Aufwand ~2h, ROI hoch für
Self-Hoster.

### Structured logging

Aktuell `console.log/error` durchs ganze server-code. Pino oder ähnliches
Pino-light. Pro Request eine Korrelations-ID. Aufwand ~3h, optional bis
nach A4 (RSC-Migration ändert wo geloggt wird).

---

## Wie hier nach /clear weitermachen

Wenn dieses Dokument nach `/clear` gelesen wird, folge **dieser** Reihenfolge
und Vorgaben:

1. Lies komplett (in dieser Reihenfolge):
   - Dieses File (`ARCHITECTURE_PLAN.md`)
   - `OSS_READINESS_PLAN.md` §7.10 (Phase-3 Zustand)
   - Memory `phase3_handover.md` (load-bearing Architektur-Calls + 4
     Drizzle-Gotchas)
   - Memory `user_preferences.md`, `feedback_apply_pacing.md`
   - `docs/TESTING.md` (Test-DB-Strategie)
   - `lib/server/publications/to-api.ts` (kanonisches Mapping-Beispiel)
   - `lib/server/db/relations.ts` (publicationTypeRef-Rename-Pattern)

2. Branch checken: `git log --oneline -25` — head sollte
   `c503426 test(e2e): bump /review header timeout to 60s + close
   Phase-3 §7.10` oder neuer sein. Wenn pressrelease-card-Commit fehlt:
   das ist OK, separate Concern.

3. **Beginne mit Phase A7** (ADRs) — kleinster scope, etabliert
   Documentation-Pattern für die folgenden Phasen.

4. Workflow pro Phase:
   - Plan-OK abnehmen (Block-Status, nicht File-für-File).
   - Implementation am Stück.
   - Smoke unter `scripts/smoke/<area>/<name>.ts` (committen, nicht
     wie in Phase 3 löschen) — Cross-cutting-Punkt.
   - `npm run typecheck && npx eslint . && npm test` → 0/14/40 (oder
     besser nach Phase A2 wenn neue Tests dazukommen).
   - Commit pro Acceptance-Criteria-Block, nicht pro File.
   - Update Acceptance-Criteria-Boxes in DIESEM File beim Closeout.

5. **Dev-Verify:** Nach jeder Phase `npm run dev` starten und mindestens
   die geänderten Routen via curl mit gate-Cookie probieren — Phase-3
   hat gezeigt dass Smoke ≠ Dev-Verify (DATABASE_URL-Gap, etc.).

6. Nach jeder Phase: Memory `phase3_handover.md` Klone als
   `phaseA<N>_handover.md` mit dem Per-Phase-Zustand. MEMORY.md Index
   updaten.

7. Lint-baseline darf nicht steigen. 14 warnings ist der baseline; jede
   neue ist ein neuer Issue, nicht "egal".

8. Don't stop unless blocked. ultrathink.

---

## Open Questions across all phases

- **Branch-Strategie:** Alles auf `refactor/drizzle-press-releases`
  weiterbauen oder pro Phase neue feature-Branch + PR? User entscheidet.
- **Memory-Hygiene:** Soll dieses File auch Memory bekommen oder reicht
  der Pointer in MEMORY.md? (Aktuell: Pointer-Eintrag wird angelegt.)
- **Phase-4 Reihenfolge:** Vitest VOR A4 (RSC)? RSC nutzt Repos direkt
  ohne API — wenn Repos schon getestet sind, ist RSC-Risiko niedriger.
  Empfehlung: Vitest-Baseline gleich nach A2.
