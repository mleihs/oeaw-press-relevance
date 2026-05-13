# Architecture Hardening Plan — Post-Phase-3

**Stand:** 2026-05-14
**Status:** A7/A2/A1/A4 closed 2026-05-12/13; withApiError + env-validation
done 2026-05-14; Cross-cutting offen (Vitest, structured logging). A5/A6
wurden 2026-05-13 in den Produkt-Track verschoben — siehe
[ADR 0015](docs/adr/0015-architecture-plan-scope-ends-at-a4.md) +
§ "Out of scope" unten.
**Vorgänger:** `OSS_READINESS_PLAN.md` (Phasen 1–3 done; Phase 4 = Vitest noch offen)
**Branch:** `refactor/drizzle-press-releases` (oder `main` nach Merge)

Vier gezielte Architektur-Hebel **nach** Phase 3 (Drizzle-Migration). Ziele:
1. Drizzle-Codebasis Phase-4-fähig machen (mockbar, repository-layered).
2. Cross-Feature-Operationen prüfen (Domain-Module-Audit).
3. Server-Rendering wo es kostenlos schneller ist.
4. ADRs als Dokumentations-Anker für OSS-Contributors.

Reihenfolge ist **load-bearing**: 7 → 2 → 1 → 4. Jede Phase baut auf der
vorigen. Pro Phase: Plan-OK, dann Implementation am Stück (per memory
`feedback_apply_pacing.md`), Block-Status statt File-für-File-Approval.

---

## Inhaltsverzeichnis

1. [Phase A7 — Architectural Decision Records](#phase-a7--adrs)
2. [Phase A2 — Repository-Layer für Drizzle](#phase-a2--repository-layer)
3. [Phase A1 — Domain-Module statt feature-flach](#phase-a1--domain-module)
4. [Phase A4 — Server-Components für read-heavy pages](#phase-a4--server-components)
5. [Out of scope: A5/A6 product-track](#out-of-scope-a5a6-product-track)
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
      heute; A6 mittlerweile out of plan scope per
      [ADR 0015](docs/adr/0015-architecture-plan-scope-ends-at-a4.md)),
      **orgunits/press-releases/sessions/lookups →
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

**Status:** [x] **Phase A4 fully closed 2026-05-13.** Pilot done on
`/persons/[id]`, Phase 1 done on `/publications/[id]` + `/press-releases`,
Phase 2 done on `/publications` (list) + `/` (Dashboard) — every
read-heavy admin page in the app is now an `async` server component.
Pilot validated: TTFB-Win + zero hydration-mismatch. Phase-1
`/publications/[id]` validated: first mutation-bearing RSC page in
the codebase + ADR 0010 (props + `router.refresh()`) closes the
ADR-0009 open question on mutation flow. Phase-1 `/press-releases`
validated: first list page taken to **max-RSC** — `<Link>`-based tab
navigation replaces shadcn `Tabs`, native `<details name=>` replaces
the `useState` row-expand toggle, zero `'use client'` in the page tree
itself. Phase-2 `/publications` (list) validated: max-RSC scales to
heavy nuqs filter state via `createLoader`+`createSerializer` from
`nuqs/server` — the page tree is RSC with 4 client islands (filter UI,
pipeline actions, export, plus the existing `PublicationTable`
treated as an island via a new `sortHrefs` record prop). The
migration also surfaced **Lessons #23-25** (function-prop crash
across RSC → Client, `nuqs/server` isomorphic parser entry-point,
pre-computed records over builder functions). Phase-2 `/` Dashboard
validated: third pilot-pattern page (after `/persons/[id]` and
`/publications/[id]`) — composite page with five `useApiQuery` calls
collapsed to one server-side `Promise.all`, time-period state lifted
from local `useState` to URL state. Surfaced **Lesson #26** (split
isomorphic values from server-only modules to keep postgres out of the
client bundle). See
[ADR 0009](docs/adr/0009-rsc-server-components-pilot.md),
[ADR 0010](docs/adr/0010-rsc-mutation-router-refresh.md), pilot closeout
below, and the phase-1 / phase-2 Acceptance checkboxes.
**Aufwand pilot:** ~3h; **phase-1 `/publications/[id]`:** ~3h;
**phase-1 `/press-releases`:** ~5h (incl. Zero-JS refactor);
**phase-2 `/publications` list:** ~4h;
**phase-2 `/` Dashboard:** ~2h.
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
- [x] `/` (Dashboard) — **Landed 2026-05-13.** Page is an `async` server-
      component reading `?period=week|month|year|all` from `searchParams`
      (defaults to `month`). `lib/server/dashboard/fetch.ts::
      getDashboardData(period)` parallel-fetches all five legacy
      `useApiQuery` sources (`publication_dashboard_stats` PG function +
      `listPublications` for Top-10 + three count queries via the same
      wrapper). The whole render tree lives in a single client subtree
      `app/_components/dashboard-client.tsx` — the **pilot pattern**
      per Lesson #21 because the page has BOTH client-only deps
      (recharts via `DimensionsRadar`, motion library, motion-number's
      `AnimateNumber`) AND mutations (`PublicationFlag` per Top-10 row).
      Time-period tabs are `<Link replace scroll={false}>` so switching
      triggers a server-side re-fetch with the new period in URL — also
      makes the dashboard view shareable (was local `useState` before).
      Isomorphic constants live in `lib/shared/dashboard.ts` so the
      client subtree can import `DASHBOARD_PERIODS` (value) without
      pulling postgres into the bundle; `DashboardData`/`DashboardStats`
      types are imported via `import type` from the server module so
      Turbopack erases the reference (see phaseA4 Lesson #26). Smoke at
      `scripts/smoke/rsc/dashboard.ts` covers three periods with the
      monotonic-window invariant + Top-10 sort + analysis-status filter.
      **Phase A4 is now fully closed.**
- [x] `/publications` (List) — **Landed 2026-05-13.** Page is an `async`
      server-component reading 27 nuqs filter fields via
      `loadFilters(searchParams)` (the nuqs `createLoader` counterpart
      to `use-filters.ts::useQueryStates`), feeding `buildApiParams`
      into `lib/server/publications/list.ts::listPublications`. Render
      tree: header / dim-avgs / pagination / empty-state are RSC inline
      (Link-based reset + Zero-JS prev/next); filters / pipeline
      cards + modals / export are 4 client islands under `_components/`.
      `PublicationTable` (782-LOC shared client component, still
      backing /review) gained a `sortHrefs?: Partial<Record<string,
      string>>` prop alongside `onSort` — pre-computed in the RSC page
      so sort headers become Zero-JS `<Link>` for RSC consumers without
      crossing the RSC → Client boundary with a function (see
      phaseA4 Lesson #23). New `app/publications/_filters.ts` bundles
      `loadFilters` + `serializeFilters` + `buildUrl(filters, patch)` +
      `buildApiParams` (handles the intentional UI ↔ API name/encoding
      divergence — TriState ↔ Bool, `showAll` ↔ inverted
      `default_eligible`, `minScore` 0-100 ↔ 0-1.0). Pre-existing bug
      fixed in passing: the legacy client `queryString` builder forgot
      to forward `filters.flagged` — the "Geflaggt für Sitzung" filter
      was dead end-to-end; `buildApiParams` now emits it and the smoke
      verifies. Smoke at `scripts/smoke/rsc/publications-list.ts`;
      pure-function tests at `app/publications/_filters.test.ts`
      (covers the API translation + URL serializer + active-filter
      detection — 23 cases). Playwright /publications light/dark +
      enrichment-modal × light/dark all green.

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

## Out of scope: A5/A6 product-track

**Removed from this plan 2026-05-13** per
[ADR 0015](docs/adr/0015-architecture-plan-scope-ends-at-a4.md).

A5 (Editorial Pipeline: `pitch_log` + `coverage`, `/pipeline` page) and
A6 (Story Bundles: `stories` + `publication_stories`, `/stories` pages)
were originally drafted as plan phases but are product features, not
architecture-hardening:

- A5 would change the Press-Team contract — `pitch_log` competes with
  MeisterTask as the canonical pipeline-state (MT produktiv seit
  2026-04-30, `memory/meistertask_integration.md`). Needs Press-Team
  buy-in.
- A6 would add a new triage surface (`/stories`) — additive but
  product-shaping. Needs product-track approval.
- Source proposals (`memory/editorial_pipeline_proposal.md`,
  `memory/story_bundles_proposal.md`) are explicitly `not approved`.

**Technical blueprints preserved.** The four ADRs from commit `7142725`
capture schema / state-machine / clustering decisions and remain valid
if/when the product initiative starts:

- [ADR 0011](docs/adr/0011-editorial-pipeline-before-stories.md) — phase-ordering (deprecated)
- [ADR 0012](docs/adr/0012-pipeline-state-machine.md) — `pitch_log` + `coverage` schema
- [ADR 0013](docs/adr/0013-story-schema-cluster-first.md) — story schema (cluster-first baseline)
- [ADR 0014](docs/adr/0014-clustering-sql-pgvector-default.md) — SQL pgvector clustering

**Architecture Plan continues with cross-cutting hardening items below.**

---

## Cross-cutting

### Vitest (= Phase 4 aus OSS_READINESS_PLAN.md §8)

A2 + A1 sind geschlossen, Vitest steht aus. Drei konkrete Test-Klassen:

- **Repo-Tests** via pg-proxy: `lib/server/repos/publications.ts` hat
  15 Methoden ohne Unit-Surface heute.
- **Domain-Tests** mit echtem Business-Wert: `applyDecision`
  (`lib/server/publications/decisions.ts`) — orchestriert decision +
  session lazy-create + MeisterTask-push. Die ursprünglich geplanten
  `transitionPub` + `promoteOrphans` wurden per
  [ADR 0008](docs/adr/0008-domain-modules-deferred.md) verworfen bzw.
  bleiben in plpgsql, sind also keine Test-Targets.
- **Smoke-Tests committen:** `scripts/smoke/` ablegen, GitHub-Actions
  Cron pingt jede Nacht — würde die Phase-3-Bugs (uuid-Bind,
  Relation-Shadow) sofort gefangen haben.

### Error-handling helper (`withApiError`)

**Status:** [x] done 2026-05-14. `lib/server/http.ts` bekam
`withApiError(handler)` HOF, der den Happy-Path einer Route mit
try/catch → `errorToApiResponse` umwickelt. `errorToApiResponse(err,
status, fallback)` ist um einen optionalen Fallback-String erweitert
(für Routes die `'Invalid request'` / `'Configuration error'` /
`'Invalid payload'` statt `'Unknown error'` zurückgeben). 24 Routes
migriert — 18 simple (try/catch komplett raus, Happy-Path linear) +
6 mixed (inner try für JSON-parse / specific error class bleibt,
fallback-Ternary → `errorToApiResponse(err, status, fallback)` oder
`throw err` zum äußeren HOF). Netto ~150 LOC weniger; tsc/eslint
0/13 / tests 60/60 unverändert. **Aufwand actual:** ~1.5h.

Originaler Anstoß: `try { ... } catch (err) { return apiError(err
instanceof Error ? err.message : 'Unknown error', 500) }` in ~25 Routes
dupliziert; `errorToApiResponse(err, status)` existierte schon im
Helper, wurde aber nie genutzt.

### Boot-time env validation

**Status:** [x] done 2026-05-14. `lib/server/env.ts` mit zod-Schema das
beim Boot alle App-Code-relevanten Vars validiert (DATABASE_URL,
SUPABASE_URL/ANON-KEY pairs, SERVICE_ROLE_KEY, GATE_TOKEN+PASSWORD,
OPENROUTER, LLM_DEFAULT_MODEL, MEISTERTASK_*). `instrumentation.ts`
als Next-16-Hook ruft `validateEnv()` beim Boot — bei Fehlern: eine
nummerierte, aggregierte Liste aller Issues + `process.exit(1)`, statt
Drizzle's cryptisches `Failed query: ...`. Schema-Field-Checks + 5
Cross-Field-Refines (Supabase-URL/ANON-Pairs, GATE-Pair, MT-Token/Section,
MT-Label-Pair) laufen unconditionally (zod-4-`.superRefine` short-
circuited bei Field-Errors → manuelle Aggregation in `parseEnv`).
Smoke unter `scripts/smoke/env/validation.ts` (28 Assertions, 13 Cases).
Script-only Vars (MYSQL_*, PG_DATABASE_URL, GATE_COOKIE, BATCH_SIZE)
sind out-of-scope — eigener Script-Lifecycle. **Aufwand actual:** ~1.5h.

**Follow-ups (out of scope, separate Issues):**
- `.env.example` hat `WEBDB_MYSQL_*`, Code liest `MYSQL_*` →
  Script-side Naming-Drift, betrifft nur `scripts/webdb-import.mjs`.
- `.env.example` doc'd `MEISTERTASK_PROJECT_ID`, kein App-Code liest
  es → vermutlich legacy, könnte aus `.env.example` raus.
- Migration der existierenden `process.env.X`-Calls auf das exportierte
  `env`-Singleton ist ein optionaler Cleanup-Pass (>20 Touchpoints,
  separater Refactor).

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

3. **Architecture phases A7→A2→A1→A4 sind alle geschlossen** (siehe
   Phase-Handover-Memories). Was offen ist: Cross-cutting-Punkte unten
   (Vitest, withApiError, env-validation, structured logging). A5/A6
   sind aus dem Plan raus — siehe [ADR 0015](docs/adr/0015-architecture-plan-scope-ends-at-a4.md)
   und § "Out of scope" unten.

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
- ~~**Phase-4 Reihenfolge:** Vitest VOR A4 (RSC)?~~ — **moot 2026-05-14:**
  A4 ist done ohne Vitest-Baseline, keine Regressionen aufgetaucht.
  Vitest jetzt eigenständig per Cross-cutting-Plan.
