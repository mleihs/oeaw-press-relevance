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

**Status:** [ ] pending. **Aufwand:** ~5h.

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
- [ ] 6 Repo-Files mit klaren primitive-Operationen (≤10 Methoden each)
- [ ] `list.ts`, `queue.ts`, `fetch.ts`, `decisions.ts`, `flag.ts` rufen
      nur noch Repos auf (keine direkten `db.query.*` / `db.select` Aufrufe)
- [ ] `db` Singleton-Import bleibt erlaubt für SQL-Functions
      (`db.execute(sql...)`) — Repos sind nur für Drizzle-Builder
- [ ] Smoke-Test pro Repo, persistent unter `scripts/smoke/repos/<entity>.ts`
      committed (siehe Cross-cutting: Smokes committen)
- [ ] Lint 0/14, tsc clean, npm test 40+ green
- [ ] Documentation: `lib/server/repos/README.md` mit "Was gehört
      hier rein, was nicht"

---

## Phase A1 — Domain-Module

**Status:** [ ] pending. **Aufwand:** ~6h. **Voraussetzung:** A2 done.

### Goal
Cross-feature Operationen, die aktuell durch 3+ Files springen, in
Domain-Bundles zusammenfassen. Kein DDD-Reinheits-Gebot, sondern:
"Was logisch eine Operation ist, soll auch eine Datei sein".

### Why
Heutige Pain-Points:

- **Decision-Flow** lebt in `publications/decisions.ts` (DB-Mutation) +
  `meistertask/push.ts` (side-effect) + `sessions/lifecycle.ts`
  (lazy-create). Phase-3 brauchte eine "TaskPublicationInput"-Type-
  Schraube weil die drei Files unterschiedliche Sichten auf dieselbe
  Pub-Row erwarten.
- **Enrichment-Pipeline** ist `enrichment/batch.ts` + `enrichment/orchestrator.ts`
  + `enrichment/sources/*.ts` — relativ sauber, aber state-machine
  ("pending → enriched → analyzed") lebt nirgends explizit.
- **Press-Release-Promote** orchestriert orphans → publications +
  Re-Refresh von Embeddings/Centroid — verteilt auf migrations + ETL-Script
  + promote-status route, keine Server-Function die das atomically
  callbar macht.

Ziel: Diese drei zu Domain-Modulen verdichten.

### Scope
**In:**
- `lib/server/triage/` — bündelt decision.ts + meistertask-push.ts +
  session-attach.ts. Eine Funktion `applyDecision(payload)` orchestriert
  alles, gibt eine `TriageResult` zurück (decision applied, session
  joined, meistertask pushed yes/no/error).
- `lib/server/pipeline/` — enrichment + analysis als state-machine.
  `transitionPub(id, target)` validiert Transition, ruft den passenden
  Orchestrator, schreibt zurück. Bestehende batch-routes rufen das.
- `lib/server/coverage/` — press_release promote + cluster refresh in
  einer transaktion. Kann von webdb-import.mjs UND einer admin-route
  gerufen werden.

**Out:**
- Keine generische "Aggregate Root"-Magie. Domain-Module sind reine
  Function-Bundles über Repos.
- Researcher-Detail bleibt SQL-Function, das ist kein TS-Domain.

### Sketch
```
lib/server/
├── triage/
│   ├── apply-decision.ts          # orchestrator: decision + session + mt push
│   ├── flag.ts                    # bleibt, ist atomic
│   ├── meistertask-push.ts        # bisher in /meistertask/
│   └── session-attach.ts          # bisher in /sessions/lifecycle.ts (Teil)
├── pipeline/
│   ├── state-machine.ts           # explicit pending|enriched|analyzed|failed
│   ├── enrich.ts                  # bisher /enrichment/{batch,orchestrator}
│   ├── analyze.ts                 # bisher /analysis/batch.ts
│   └── sources/                   # crossref, openalex, ... — unverändert
├── coverage/
│   ├── promote-orphans.ts         # SQL-Function-Wrapper + Refresh-Chain
│   └── refresh-cluster.ts
└── repos/                          # aus Phase A2
```

`lib/server/publications/` schrumpft auf die "pure read"-Surface
(list.ts, fetch.ts, flag.ts). Routes ändern ihre Imports.

### Acceptance Criteria
- [ ] `apply-decision.ts` ist die einzige Stelle die `updateDecision` +
      MeisterTask-Push + Session-Lazy-Create kennt. Route ist <30 LOC.
- [ ] state-machine.ts hat enum-typed Transitionen + Tests
- [ ] webdb-import.mjs Promote-Schritt nutzt `coverage/promote-orphans.ts`
      (ein gemeinsamer Code-Pfad mit der admin-route)
- [ ] eslint-plugin-boundaries Allow-List aktualisiert
- [ ] `docs/IMPLEMENTATION.md` Layout-Diagramm aktualisiert
- [ ] Lint/Test/Smokes green; Playwright review-smoke bleibt grün

---

## Phase A4 — Server-Components

**Status:** [ ] pending. **Aufwand:** ~14h. **Voraussetzung:** A2 done
(Repos sind das, was RSCs sauber aufrufen können — `useApiQuery` wird
durch direkte Repo-Calls ersetzt).

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
- [ ] `/persons/[id]` (Researcher-Detail) — einziger RPC-Call, Single
      `useApiQuery`, keine Filter, keine Mutations: kleinster Blast-Radius.

**Phase 1 (nach Pilot-Validation, klare Wins):**
- [ ] `/publications/[id]` (Detail) → RSC für Pub-Daten, similar-pressed
      bleibt Client-Card (lazy)
- [ ] `/press-releases` (List) → RSC

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

### Acceptance Criteria
- [ ] /publications/[id] hat TTFB < 800ms (vorher ~2s wegen 2 client-roundtrips)
- [ ] No new "Use client" leaks via eslint-boundaries
- [ ] Playwright e2e bleibt grün (timing-asserts ggf. anpassen weil
      schneller geworden)
- [ ] Cache-Strategie pro RSC dokumentiert (force-dynamic vs
      revalidate=N) — landet als ADR
- [ ] Decision-Toolbar funktioniert weiter (hängt am Client-side
      mutation-flow)

### Open Questions
- Wie viel ist Vercel-locked? Self-hosting-OSS: Node-Server kann RSC, OK.
- TanStack-Query SSR-Hydration via `dehydrate`/`HydrationBoundary` —
  Pattern jetzt evaluieren, eine ADR.

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
