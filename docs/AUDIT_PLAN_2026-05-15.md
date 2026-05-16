# Post-Audit Action Plan — 2026-05-15

**Source:** Deep Full Audit ran 2026-05-15 across 5 parallel domains (security, code quality, performance, test+doc, db schema) plus baseline `lint`/`tsc`/`test`. All findings consolidated below into a tickable plan ordered by risk-adjusted impact.

**Branch state at audit:** `refactor/drizzle-press-releases` (== `main`, last commit `616b0b1` 2026-05-14, working tree clean).

## Baseline at audit time

| Check | Status |
|---|---|
| `npm run lint` | 0 errors, 17 warnings (unused-vars/imports) |
| `npx tsc --noEmit` | clean for source files (3 errors in `.next/dev/types/*` are dev-typegen artifacts; `rm -rf .next && npx tsc --noEmit` confirms) |
| `npm test` (Vitest) | 9 files / 60 tests / all green |
| Prod state | up, 11/11 env vars set on `oeaw-press-relevance.vercel.app`, migration `20260514000001` applied |

## Phasing principle

Phases ordered by **risk-adjusted impact**, not raw P0/P1/P2 severity. Phase 1 gives same-day visible wins with near-zero risk. Phases 2-3 plug security + perf gaps. Phases 4-5 build test scaffolding + structural cleanup that prevents regression.

**Workflow:** Block-Cadence per `memory/feedback_apply_pacing.md` — Plan-OK heißt durch-implementieren, nicht File-by-File-Confirm. Nach jedem Task: Checkbox abhaken (in dieser Datei), commit individuell, push.

---

## Phase 1 — Same-Day Quick Wins (~1.5h)

### - [x] 1.1 — Dimension-Sort-Indexes Migration [P0, ~15min]

**Why:** jeder Radar-Achsen-Click full-table-scans ~7.375 Publications. `press_score` und `published_at` sind indexed, die 5 Dimension-Spalten nicht.

**Files:** neue Migration `supabase/migrations/20260515000001_dimension_sort_indexes.sql`

**Steps:**
1. Migration mit 5 Indexes: `CREATE INDEX idx_pub_<dim> ON publications (<dim> DESC NULLS LAST)` für `public_accessibility`, `societal_relevance`, `novelty_factor`, `storytelling_potential`, `media_timeliness`. Optional: composite indexes `(analysis_status, <dim> DESC NULLS LAST)` analog zu `idx_pub_analysis_score`.
2. Lokal applyen via `supabase migration up` oder direkt psql.
3. Prod applyen via Pooler-URL (`memory:prod_db_url_location`).
4. Verifizieren mit `EXPLAIN ANALYZE SELECT * FROM publications WHERE analysis_status='analyzed' ORDER BY novelty_factor DESC NULLS LAST LIMIT 20` — sollte `Index Scan` zeigen, kein `Seq Scan`.

**Acceptance:** EXPLAIN zeigt Index-Nutzung lokal + prod; `scripts/smoke/rsc/dashboard.ts` grün.

### - [x] 1.2 — `descNullsLast` für `releasedAt` [P1, ~10min]

**Why:** nullable Column mit `desc()` floatet Nulls an den Top der Press-Release-Liste — direkter Parallelfall zum `published_at`-Fix der `sort.ts` motiviert hat.

**Files:** `lib/server/press-releases/list.ts:142,146`

**Steps:** `desc(pressReleasesTable.releasedAt)` → `descNullsLast(pressReleasesTable.releasedAt)`; Import aus `@/lib/server/db/sort`.

**Acceptance:** Visual-check auf `/press-releases` — Orphans ohne released_at landen am Ende; Vitest + smoke unverändert grün.

### - [x] 1.3 — `docs/TECH_HANDOVER.md` Header refresh [P0, ~5min]

**Why:** Header sagt „Last refresh: 2026-04-29 (after MT3 ship)" + „Branch state: main, 4 commits ahead". Heute = 2026-05-15. 16 Tage stale + falsche Branch-Behauptung; wer's als Resume-Doc liest, kriegt falsches Mental-Model.

**Files:** `docs/TECH_HANDOVER.md` (Top-Section)

**Steps:**
1. „Last refresh"-Datum auf 2026-05-15 heben.
2. Branch-State-Behauptung entfernen oder auf aktuellen Stand bringen.
3. Wave-Status-Marker (H1-H9) gegen `git log` cross-checken — flag was nicht mehr aktuell ist.

**Acceptance:** Header reflektiert Reality; bei nächstem Resume-Lesen passt's.

### - [x] 1.4 — `.env.example` mit zod-Schema syncen [P1, ~10min]

**Why:** 4 vars im Validator-Schema (`lib/server/env.ts`) fehlen in `.env.example` — neue Dev-Setups bootstrappen ohne klare Anleitung.

**Files:** `.env.example`

**Steps:** Hinzufügen mit Kommentar-Erklärungen:
- `LLM_DEFAULT_MODEL=anthropic/claude-sonnet-4` (Default)
- `NODE_ENV=development`
- `NEXT_PUBLIC_SUPABASE_URL=` (legacy fallback für SUPABASE_URL)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=` (legacy fallback)

Optional: Sektions-Kommentar erklären welche vars script-only sind (MEISTERTASK_PROJECT_ID, WEBDB_MYSQL_*) und vom Validator ignoriert werden.

**Acceptance:** Diff `.env.example` ↔ zod-Schema in `lib/server/env.ts` = leer (für App-Code-vars); `scripts/smoke/env/validation.ts` grün.

### - [x] 1.5 — Lint-Warnings auf 0 (unused-vars subset) [P2, ~30min]

**Why:** Wachstumsbasis — ein „0 errors / 0 warnings"-Baseline macht künftige Drift sichtbar.

**Scope revision (2026-05-15):** Baseline-Annahme „alle 17 unused-var/import" stimmte nicht. Reality split:
- 10 unused-vars/imports in `scripts/*` + `components/ui/virtualized-multi-select.tsx` (React Compiler incompat) + `lib/client/hooks/use-info-bubbles.ts` (setState-in-effect, kanonisch refactorbar via `useSyncExternalStore`) → done, 17 → 7.
- 7 verbleibende `react-hooks/set-state-in-effect` warnings sind TECH_HANDOVER #1 Architektur-Schuld (verschiedene Patterns: theme hydration, filter sync, animation control, localStorage init); jeder Refactor ist eigenständig + non-trivial. Split off as Task 5.6.

**Acceptance:** unused-var subset = 0 warnings; remaining 7 zähle ich nicht mehr unter 1.5 sondern unter 5.6.

### - [x] 1.6 — Fresh `.next/` für sauberen tsc-Run [P2, ~2min]

**Why:** tsc reported 3 errors in `.next/dev/types/*` (generated files vom Dev-Server). Nicht-Source, aber confused-machend für neue Devs.

**Steps:** `rm -rf .next && npx tsc --noEmit`. Optional: `.next/dev/types/**` in `tsconfig.json` `exclude` ergänzen für Dauerschutz.

**Acceptance:** `tsc --noEmit` exits 0 ohne `.next`-Reset.

---

## Phase 2 — Security Hardening (~3h)

### - [x] 2.1 — CSRF-Schutz: Origin-Check + SameSite=Strict [P0, ~45min]

**Why:** Gate-Cookie ist `SameSite=Lax` — bösartige Seiten können Top-Level-`POST` an `/api/publications/[id]/decision` (triggert MeisterTask-Push), `/api/publications/[id]/flag` etc. mit dem Cookie des Triagers feuern. Kein Origin/Referer-Check existiert.

**Files:**
- `lib/server/http.ts` (wo `withApiError` lebt): neue Helper `assertSameOrigin(req)`
- Alle POST/PATCH/DELETE Routes unter `app/api/**/route.ts`: Wrap mit Helper
- `app/api/auth/gate/route.ts:44`: Cookie auf `SameSite=Strict`

**Steps:**
1. Helper in `lib/server/http.ts`: liest `req.headers.get('origin')` + `req.headers.get('host')`, vergleicht. Returnt 403 wenn mismatch.
2. In `withApiError` für mutating-Methods automatisch durchlaufen lassen.
3. Cookie-Attribut auf `SameSite=Strict` umstellen.
4. Smoke + Playwright-Specs gegenchecken (sollten same-origin sein und durchlaufen).

**Acceptance:** Cross-origin curl `POST /api/publications/<id>/decision` returns 403; same-origin POST funktioniert; `scripts/smoke/rsc/publications-detail.ts` grün.

### - [x] 2.2 — zod-Validation in Batch-Routes [P1, ~30min]

**Why:** Zwei Outlier-Routes (`enrichment/batch`, `analysis/batch`) parsen Bodies mit Custom-Throw-Functions statt zod-safeParse — andere mutating-Routes (`flag`, `decision`, `finish`, `meistertask/push`) nutzen alle zod.

**Files:** 
- `app/api/enrichment/batch/route.ts:27` (mit `parseEnrichmentBatchBody`)
- `app/api/analysis/batch/route.ts:26` (mit `parseAnalysisBatchBody`)

**Steps:** Beide auf zod-Schema umbauen, `safeParse`, bei Fail 400 returnen. Existing Throw-basierter Code als Fallback prüfen.

**Acceptance:** Invalid payload returnt 400 mit zod-Error-Details (statt 500); existing happy paths grün.

### - [x] 2.3 — Constant-Time-Compare + Rate-Limit auf Gate [P1, ~30min]

**Why:** Single-Password-Gate ist brute-forceable; `password !== expectedPassword` ist eine Timing-Oracle.

**Files:** `app/api/auth/gate/route.ts:36`

**Steps:**
1. `password !== expectedPassword` → `crypto.timingSafeEqual(Buffer.from(password), Buffer.from(expectedPassword))`.
2. Rate-Limit: in-memory Map mit IP→count + reset alle 60s, returnt 429 ab 5 Fail-Attempts/min. Alternative: Cookie-based counter mit Increment.
3. Smoke-Test für Rate-Limit-Pfad.

**Acceptance:** 6 schnelle invalid-POSTs → 5×401 + 1×429; korrekter Password klappt immer noch first-try.

### - [x] 2.4 — MeisterTask-Push Error-Redaktion [P1, ~15min]

**Why:** `app/api/meistertask/push/route.ts:32-33` echo't `err.message` der Upstream-API in Response — kann Tokens/IDs leaken.

**Files:** `app/api/meistertask/push/route.ts:32-33` + `lib/server/meistertask/push.ts` (wo Throw landet)

**Steps:** Response auf generisches `MeisterTask push failed — see server logs` ändern; `console.error` server-side für volles Detail.

**Acceptance:** Forced-Failure-Test zeigt generische Message; Server-Log hat Detail.

### - [x] 2.5 — GATE_TOKEN + GATE_PASSWORD required im Validator [P1, ~20min]

**Why:** Beide aktuell `.optional()`. Wenn auf einem Vercel-Projekt missing → Middleware in Pass-Through-Mode → anonyme API. Genau der gestrige Outage-Mechanismus rebooted für GATE.

**Files:** `lib/server/env.ts:42-44` + `scripts/smoke/env/validation.ts`

**Pre-Work (CRITICAL):**
1. `vercel env ls production --project oeaw-press-release` — beide vars present?
2. Gleiche Prüfung für `oeaw-press-relevance` (sollten beide drauf sein nach gestrigen Push).
3. ERST danach Validator tightenen, sonst recreate'st du gestern's Incident auf `oeaw-press-release` Projekt.

**Steps:**
1. Schema: `GATE_TOKEN: z.string().min(1)` + `GATE_PASSWORD: z.string().min(1)` (required statt optional).
2. `runConditionalChecks` Cleanup: existing Cross-Field-Check für GATE-Pair ist jetzt redundant, kann entfernen.
3. Smoke-File +1 Assertion: missing GATE_PASSWORD → validator fail.
4. Deploy + verify both projects.

**Acceptance:** Validator boots beide Vercel-Projekte grün; locale Override mit unset → validator exits.

### - [x] 2.6 — `appBaseUrl` Origin-Whitelisting in applyDecision [P2, ~15min]

**Why:** `req.nextUrl.origin` wird unvalidated als `appBaseUrl` an MeisterTask-Description gepasst — `X-Forwarded-Host`-Spoofing schreibt Phishing-URL in Tasks.

**Files:** `app/api/publications/[id]/decision/route.ts:27` + `lib/server/meistertask/mapping.ts:66`

**Steps:** Env-var `ALLOWED_ORIGINS` (comma-sep), Whitelist-Check, reject mit 400 wenn mismatch. Default-Wert: `https://oeaw-press-relevance.vercel.app,https://oeaw-press-release.vercel.app,http://localhost:3000`.

**Acceptance:** Curl mit X-Forwarded-Host gefakt → 400; legitimer Call → MeisterTask-Card hat richtige URL.

---

## Phase 3 — Performance Polish (~1h)

### - [x] 3.1 — Leaderboard-Distribution conditional fetch [P1, ~15min]

**Why:** `useLeaderboard()` fetcht IMMER 500 distribution-rows beim Mount, auch wenn User auf Leaderboard-Tab bleibt.

**Files:** `app/researchers/_hooks/use-leaderboard.ts:45` + `app/researchers/page.tsx`

**Steps:** Hook nimmt `enabled: boolean` Prop; Page-Component setzt `enabled = filters.view === 'distribution'`. Bei `false` returnt Hook leeres Result, fired keinen Fetch.

**Acceptance:** Network-Tab beim Mount auf Leaderboard-View → kein Distribution-Request; Switch zu Distribution → ein Request.

### - [x] 3.2 — `/press-releases` zu ISR [P1, ~10min]

**Why:** `force-dynamic` ohne zwingenden Grund (kein per-User-State, keine Decision-Toolbar auf dieser Page). `revalidate=60` würde p95 deutlich senken.

**Files:** `app/press-releases/page.tsx:18`

**Steps:** `export const dynamic = 'force-dynamic'` → `export const revalidate = 60`.

**Acceptance:** Smoke grün; manueller Page-Reload zeigt Cache-Hit nach 1. Render; nach 60s Cache-Miss; ETL-Update sichtbar nach <60s.

### - [x] 3.3 — Dashboard-Counts collapsen [P1, ~30min]

**Why:** `lib/server/dashboard/fetch.ts:150-158` `countWith` fired pro Call eine full main+count Pair. 3 Call-Sites × 2 Queries = 6 Round-Trips. Sollte 3 `SELECT count(*)` sein.

**Files:** `lib/server/dashboard/fetch.ts:150-158` + `lib/server/publications/list.ts`

**Steps:** 
1. Option A: `listPublications` bekommt `countOnly: true` Flag, skipt das Main-Query.
2. Option B: separate `countPublications(filters)` Function im Repository-Pattern.
3. Smoke-Timing-Vergleich vor/nach.

**Acceptance:** Dashboard-TTFB sinkt messbar (Smoke-Skript mit `console.time`); Test-Count unverändert.

---

## Phase 4 — Test Scaffolding (~5h)

### - [x] 4.1 — Vitest für `publications/list.ts` SORTABLE_COLUMNS-Guard [P0, ~1h]

**Why:** Genau das File wo 2026-05-14 die 5 Dimension-Columns hinzugefügt wurden ohne Index-Check. Ein typed Test hätte Finding #1.1 verhindert.

**Files:** neuer `lib/server/publications/list.test.ts`

**Steps:**
1. Test: jede Key in `SORTABLE_COLUMNS` mappt auf eine existierende Drizzle-Spalte.
2. Test: Für jede SORTABLE_COLUMN entweder `(a)` ein Index existiert ODER `(b)` ein expliziter Marker `INTENTIONALLY_UNINDEXED: Set<string>` listet sie (zwingt Entscheider:in beim PR-Review zu bewusster Wahl).
3. Test: `listPublications({ sort: 'novelty_factor' })` returnt sorted result; same für 4 weitere Dimensions.
4. Test: Invalid `sort` Wert default'et zu `published_at`.

**Acceptance:** Vitest +5-7 Tests; CI fail'd wenn jemand SORTABLE_COLUMNS erweitert ohne Index oder Whitelist.

### - [x] 4.2 — Vitest für `publications/to-api.ts` [P1, ~1h]

**Why:** Pure Transform-Function (255 LOC, 0 Tests). Highest Test-ROI weil keine Side-Effects.

**Files:** neuer `lib/server/publications/to-api.test.ts`

**Steps:** 8-10 Input-Shapes testen: null vs filled relations, Scoring Edge-Cases, lead_author Fallback, publication-types Mapping, mahighlight=true vs false, orgunits-Array-Shapes.

**Acceptance:** Vitest +8-10 Tests; Coverage-Report für `to-api.ts` zeigt >85%.

### - [x] 4.3 — Vitest für `repos/publications.ts` [P1, ~1.5h]

**Why:** Repository ist seit Phase A2 die canonical Daten-Schicht (15 Methods). Smoke covers happy paths; Unit-Tests catchen Edge-Cases.

**Files:** neuer `lib/server/repos/publications.test.ts`

**Steps:** 5-7 von 15 Methods mit Vitest-Test-DB-Pattern (oder mocked Drizzle). Top-Methods: `findById`, `listForDashboard`, `countByFilter`, `updateDecision`, `findByDoiOrTitle`.

**Acceptance:** Vitest +5-7 Tests; Repo-Refactor-Sicherheit beim nächsten Schema-Change.

### - [x] 4.4 — Smoke für `/review` + `/researchers` [P1, ~1h]

**Why:** 3 von 7 RSC-Pages ohne Smoke-File. `/help` ist Fumadocs, vermutlich intentional skipped; `/review` + `/researchers` sollten dazu.

**Files:** neue `scripts/smoke/rsc/review.ts` + `scripts/smoke/rsc/researchers.ts`

**Steps:** Nach Vorbild `scripts/smoke/rsc/publications-list.ts`: gegen lokale DB, smoke-test happy paths + 2-3 Edge-Cases.

**Acceptance:** Beide Smokes grün lokal.

### - [x] 4.5 — `scripts/test-*.mjs` → `e2e/*.spec.ts` migrieren [P2, ~1h]

**Why:** 6 standalone Playwright-Skripte sind drift-anfällig (separat von `playwright.config.ts`).

**Files:** alle `scripts/test-*.mjs` → `e2e/`

**Steps:** Pro Skript: in `e2e/<name>.spec.ts` umschreiben, Playwright-Conventions (`test.describe`, `test('...', async ({ page }) => ...)`).

**Acceptance:** `npx playwright test` running alle e2e specs incl. der migrated; `scripts/test-*.mjs` gelöscht.

---

## Phase 5 — Structural Cleanup (~6h)

### - [x] 5.1 — Vitest für `enrichment/batch.ts` [P0, ~3-4h]

**Why:** 565 LOC, 0 Tests, complex side-effect Pathway (OpenAlex API + DB mutations). Highest Risk-Reduction-Test im Codebase.

**Files:** neuer `lib/server/enrichment/batch.test.ts`

**Steps:** 6-8 Scenarios mit mocked OpenAlex-Fetch:
1. Happy-Path: 5 Pubs enriched mit allen Feldern.
2. OpenAlex returnt 404 für eine DOI.
3. OpenAlex returnt 500 für eine DOI.
4. Partial-Enrichment: nur abstract, kein authors.
5. DOI-Fallback-Pfad triggert (URL-Slug-Heuristik).
6. Dedupe: gleicher webdb_uid 2× im Batch.
7. Rate-Limit-Trigger.
8. Transaction-Rollback bei DB-Fehler nach erfolgreichem Fetch.

**Acceptance:** Vitest +6-8 Tests; Future-Refactor-Safety für die schwerste Code-Pfad in lib/server/.

### - [x] 5.2 — Structured Logging Setup [P1, ~2-3h]

**Why:** ARCHITECTURE_PLAN flagt's offen. `console.error` everywhere; Vercel-Logs sind unstructured.

**Files:** neuer `lib/server/log.ts` + Updates über alle Routes + `withApiError`

**Steps:**
1. `pino` als Dep (oder `tslog` wenn leichter).
2. Logger mit `route`, `requestId`, `userId` (wenn gateable), `error` als JSON-Felder.
3. `withApiError` Wrap auto-loggt Errors mit Stack + Request-Context.
4. Top 10 `console.error`/`console.log`-Sites in `lib/server/` migrieren.
5. Vercel-Logs cross-check (sollte JSON sein).

**Acceptance:** `vercel logs --json` zeigt strukturierte Felder; grep nach route/error-type funktioniert.

### - [ ] 5.3 — Drizzle Schema Mirror View-Body Refresh [P2, ~30min]

**Why:** `lib/server/db/schema.ts:645` `press_cluster_view` Body reflektiert pre-`DISTINCT ON`-Version (Migration `20260511000002`). Drizzle introspectet View-SQL nicht für Types, funktional egal, aber das File misrepräsentiert Prod.

**Files:** `lib/server/db/schema.ts:645`

**Steps:** View-Definition auf `DISTINCT ON (pe.publication_id)`-Form aktualisieren (matched Prod-DB-State).

**Acceptance:** Schema-Mirror = Prod-DB-State; Smoke unverändert.

### - [ ] 5.4 — Stale `press_release_orphans`-Mentions entfernen [P2, ~20min]

**Why:** Tabelle seit `20260509000003:150` gedroppt, Function `promote_press_release_orphans()` existiert noch. 3 UI/Doc-Strings reden über die Tabelle (technisch korrekt wäre Function).

**Files:**
- `app/press-releases/_components/orphans-list.tsx:57`
- `lib/client/explanations.tsx:1388`  
- `lib/server/repos/README.md:75`

**Steps:** Pro File: Rephrasen → entweder Function nennen oder Live-Table `press_releases.where(publication_id IS NULL)`-Pattern.

**Acceptance:** Grep `press_release_orphans` matcht nur noch in Migration-Files + Function-Definition.

### - [ ] 5.6 — `react-hooks/set-state-in-effect` warnings (7 components) [P1, ~2-3h]

**Why:** Split off von Task 1.5 nach Reality-Check. Diese 7 sind die im TECH_HANDOVER #1 explizit als „Architektur-Entscheidung pending" geflagte Schuld. Jeder Site hat eigenes Pattern, kein Copy-Paste-Fix möglich.

**Files (current snapshot):**
- `app/persons/[id]/_components/activity-chart.tsx:24` — theme hydration (`mounted` flag)
- `app/publications/_components/filters-bar.tsx:45` — `filters.q` sync
- `app/researchers/_components/beeswarm-view.tsx:82` — derived `maxBuckets` from `points`
- `app/settings/page.tsx:24` — init effect with `setState`
- `components/capybara-glitch.tsx:72` — animation play/stop controller
- `components/changelog-panel.tsx:114` — localStorage-derived `hasUnread` + `everOpened`
- `components/password-gate.tsx:44` — sessionStorage auth-check

**Steps per category:**
1. localStorage/sessionStorage-derived (changelog, password-gate, settings) → `useSyncExternalStore` (Vorbild: `lib/client/hooks/use-info-bubbles.ts` commit 7…).
2. Derived state (filters-bar, beeswarm) → `useMemo` oder controlled-input pattern.
3. Theme hydration (activity-chart) → `mounted` ist kanonisch; `eslint-disable-next-line` mit Verweis auf next-themes SSR-Pattern.
4. Animation controller (capybara-glitch) → legitimate side-effect; `eslint-disable-next-line` mit Rationale.

**Acceptance:** `npm run lint` returnt `0 errors / 0 warnings`.

### - [ ] 5.5 — ARCHITECTURE_PLAN Status-Refresh [P1, ~30min]

**Why:** Status-Header sagt „Cross-cutting offen (Vitest, structured logging)". Vitest ist bootstrapped (60 Tests), structured Logging noch absent. Misleading.

**Files:** `ARCHITECTURE_PLAN.md` (Status-Header + Cross-Cutting-Sektion)

**Steps:**
1. Vitest-Eintrag: „bootstrapped 2026-05-X (60 Tests, scaling pending — see AUDIT_PLAN_2026-05-15 §4-5)"
2. Structured-Logging-Eintrag: „in progress — see AUDIT_PLAN_2026-05-15 §5.2" (oder „done" nach Task 5.2).
3. env-validation-Eintrag bereits `[x] done`, korrekt.

**Acceptance:** Status-Header reflektiert Reality + crosslinks AUDIT_PLAN.

---

## Phase 6 — Backlog (not scheduled)

- [ ] **`supabase_migrations.schema_migrations`-Tracking re-syncen** — Prod-Drift dokumentiert seit Phase 3, low value. Nur relevant wenn `supabase db push` jemals genutzt werden soll. Bis dahin manuelles psql-Apply ist canonical.

- [ ] **Vitest-Skalierung auf 200+ Tests** — Roadmap. Tasks 4.1-4.4 + 5.1 bringen +25-30 Tests; weiter dann lib/shared/* und lib/server/persons + lib/server/sessions.

- [ ] **Em-Dash-Gate als ESLint-Plugin (MDX)** — aktuell bash-Skript. Promote zu ESLint-Plugin gibt in-editor Feedback. Aufwand ~3h, geringer ROI solange das Skript läuft.

- [ ] **Schema-Migration-Order-Linter** — kleine CLI die Migrations chronologisch prüft + FK-Referenz-Vorbedingungen checkt. Verhindert seltene aber teure Bugs.

- [ ] **Vercel Project Dedup** — zwei Projekte (`oeaw-press-release` + `oeaw-press-relevance`) deployen aktuell den gleichen Branch. Konsolidieren auf eines spart Env-Var-Pflege + Deploy-Zeit. Erfordert DNS-Entscheidung mit User.

---

## Resume Command (für nach /clear)

```
Pick up post-audit Phase 5 auf main (last commit 1c22df2, 23 Commits
Session 2026-05-15 inkl. 2 Review-Polish-Commits, in sync mit origin/main).

Read in order:
1. memory/MEMORY.md (full index)
2. docs/AUDIT_PLAN_2026-05-15.md (DIESER Plan — Phase 1-4 alle abgehakt,
   Phase 5 ist offen; Source of Truth)
3. memory/vitest_db_coupling_pattern.md (relevant für Task 5.1 enrichment Vitest)
4. memory/vercel_cli_workflow.md (CLI-Setup, eingeloggt als mleihs,
   .vercel/ ist auf oeaw-press-relevance gelinkt)
5. memory/user_preferences.md (Stil-Defaults)
6. memory/feedback_apply_pacing.md (Plan-OK = Block-Cadence)

State nach Session 2026-05-15:
- Phases 1-4 fertig (19/19 + Task 5.6 als Spillover von 1.5; insgesamt 19 ticks)
- Post-Review-Polish: rate-limit nach lib/server/rate-limit.ts extrahiert
  (createRateLimiter Factory + getClientIp), dead dev-passthrough aus
  gate/route.ts raus, withApiError JSDoc + revalidate-Comment geschärft
- Phase 5 offen: 5.1 (Vitest enrichment 3-4h), 5.2 (structured logging 2-3h),
  5.3 (View-body refresh), 5.4 (stale press_release_orphans-Strings),
  5.5 (ARCHITECTURE_PLAN refresh), 5.6 (7 setState-in-effect)
- Baseline: lint 0 errors / 7 warnings (alle 7 sind setState-in-effect = Task 5.6),
  vitest 92/92 grün, tsc clean, alle Smokes grün
- Prod: oeaw-press-relevance.vercel.app deployed nach 2.5+2.6, verified
  homepage 200 + /api/auth/gate 401
- GATE_TOKEN + GATE_PASSWORD jetzt REQUIRED im Validator; beide Vercel-Projekte
  haben sie. ALLOWED_ORIGINS optional mit Default-Allowlist (relevance/release/localhost)

Aufgabe: nächste unticked Task in AUDIT_PLAN_2026-05-15.md anpacken.
Phase 5 startet mit 5.1 (höchster Risiko-ROI, plus vitest_db_coupling_pattern
hilft direkt). Per Task: implement am Stück, Checkbox abhaken IM PLAN-FILE,
commit individuell mit Co-Authored-By Trailer, push.

Achtung Task 5.2 (structured logging): touches alle Routes via withApiError —
vor dem Commit Smoke + Vitest cross-checken weil signature-änderung möglich.
withApiError macht inzwischen 2 Jobs (CSRF-Guard + throw-to-500) — beim
Logging-Wrap beide Pfade abdecken, nicht nur den catch.

Style: deutsche Anführungszeichen, keine em-dashes (ESLint gate auf
lib-client/changelog.ts + MDX; in TS-Files auch konvention),
„Story Scout" + „Story Score" mit Space.

ultrathink.
```

---

## Effort summary

| Phase | Total effort | Tasks |
|---|---|---|
| 1 — Quick Wins | ~1.5h | 6 |
| 2 — Security | ~3h | 6 |
| 3 — Performance | ~1h | 3 |
| 4 — Tests | ~5h | 5 |
| 5 — Structural | ~8-9h | 6 (incl. 5.6 split off from 1.5) |
| 6 — Backlog | unscheduled | 5 |
| **Total Phases 1-5** | **~18-19h** | **26 tickable tasks** |

Realistisch über 3-5 Sittings, je nach Verfügbarkeit. Phase 1+2 in einer Sitzung (4-5h) bringt sofort visible Win + Security-Baseline.
