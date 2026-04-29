# TECH_HANDOVER

**Last refresh:** 2026-04-29 (after H9 ship)
**Branch state at handover:** `main`, in sync with `origin/main` after H1–H9 push.

This is the technical handover doc — distinct from `HANDOVER.md`, which is the
ongoing scoring-session log. If you're picking this up after a `/clear` or in
a fresh session, read this first. It cross-references everything else.

---

## What just landed (2026-04-29)

| Wave | Commit | What |
|---|---|---|
| H1 | `3fff8fc` | AppSettings cleanup + ScoreDimension type-safety (`satisfies`) + `x-llm-model` header weg |
| H2 | `9fba2e9` | Vitest + 11 tests on Score-/Filter-/Title-Reinkern (`lib/scoring.ts` JS-port der PG-Functions) |
| H3 | `269c635` | IMPLEMENTATION.md komplett refresht (1050 → 609 Zeilen), neue Source-of-Truth-Map als Section 2 |
| H4 | `651e047` | `supabase/ROLLBACK.md` cookbook für die 17 Migrations |
| H5 | `625b7be` | Browser-CSV-Upload-Pfad komplett entfernt — Auth-Gate-Loch zu, `lib/supabase.ts` collapsed in `api-helpers.ts` |
| H6 | `ccb5f0b` | `npm audit fix` — 12 vulns → 4 (alle restlichen postcss/upstream-blocked) |
| H7 | `eec3c1e` | `ELIGIBILITY_EXCLUDE_TYPE_UIDS` in `lib/eligibility.ts` extrahiert (Drift strukturell unmöglich, nicht nur getestet) |
| H8 | `d99ad09` | `users` + `user_settings` Schema-Stub (Multi-User Foundation, `20260429000004_users_stub.sql`) |
| H9 | `dfd71ba` | GitHub Action CI (typecheck + lint + test + audit) + Lint-Schulden auf warn degradiert |

Davor (gleicher Tag, früher in der Session): Lucide 1.x, TypeScript 6.0.3,
shadcn 4.6, plus die G1–G4-Wellen (Auth-Gate, apiError, publication_score_stats,
useDeferredValue + SCORE_WEIGHTS single source). Siehe `git log` für Details.

---

## Verifizierter aktueller Zustand

```
npm run typecheck   → silent
npm run lint        → exit 0  (18 warnings, 0 errors — siehe Tech-Debt #2)
npm test            → 11/11 grün, ~800 ms
npm audit --audit-level=high  → exit 0  (4 moderate postcss verbleiben)
```

8 gegatete Pages return 200 mit Auth-Cookie:
`/`, `/analysis`, `/publications`, `/publications/[id]`,
`/researchers`, `/persons/[id]`, `/settings`, `/upload`.

CI workflow `.github/workflows/ci.yml` greift ab nächstem Push/PR.

---

## Offene Tech-Debt (mit Empfehlung)

### #1 `react-hooks/set-state-in-effect` (6 warnings) — ARCHITEKTUR-ENTSCHEIDUNG PENDING

Sieh Memory-File **`react_data_fetching_decision.md`** für die drei
Optionen (react-query / SWR / custom). Bevor jemand das angeht, muss
EINE Wahl getroffen werden — sonst brennt die nächste Session 30+ min auf
derselben Recherche.

Lokale Sites:
- `app/settings/page.tsx:21` — localStorage-Sync (proper: `useSyncExternalStore`)
- `app/researchers/_hooks/use-leaderboard.ts:33,86` — fetch + loading (proper: react-query/SWR/custom)
- `app/researchers/_components/beeswarm-view.tsx:79` — derived state (trivial fix: early return)
- 2 weitere ähnlich

### #2 `unused-vars` warnings (18 total, mostly in `scripts/`)

Schnellfix: `npm run lint -- --fix`, dann manuelle Cleanups:
- `scripts/webdb-import.mjs:401,584` — `memberTypeMap`, `normalizeDoi` ungenutzt
- `scripts/session-pipeline.mjs:145,599` — ähnlich
- ~6 Stellen total, ~15 min

Niedrige Priorität. Macht nur `npm run lint`-Output leiser.

### #3 4 moderate postcss vulns (`GHSA-qx2v-qp2m-jg93`)

Upstream blockiert — der Pin sitzt in `next` package, kein Override sicher.
Praktische Exploit-Surface ≈ 0 (Tailwind-Build, kein User-CSS-Input).
Auf Next.js-Update warten. Kein Action nötig.

(Es gibt eine Schedule-Routine `trig_01CuXa3nitX22bov7ZcV7wFy` die
monatlich auf eslint-plugin-import 2.33+ Unblock prüft — separates Thema,
nicht postcss.)

### #4 `schema_migrations` Drift — ✅ ERLEDIGT in dieser Session

Lokales `supabase_migrations.schema_migrations` hatte 7 Versionen
(20260428000007 bis 20260429000003) nicht getrackt, obwohl die
Schema-Effekte angewandt waren. INSERT der fehlenden Tracking-Rows
durchgeführt. Production-Supabase hat eigene Tracking-Tabelle, von
diesem Fix nicht berührt.

---

## Strategische Hochwert-Hebel aus dem Architektur-Review (2026-04-29)

Diese drei sind die Top-3 aus dem Deep-Dive. Jeder braucht eine eigene
Session/Branch — bewusst NICHT in den H1–H9-Cleanup mitgenommen.

1. **Editorial Pipeline + Coverage-Loop** — Memory:
   `editorial_pipeline_proposal.md`. ~3–5 Tage. Reframes von Discovery zu
   Workflow + erste echte Outcome-Metrik fürs Scoring (correlation
   press_score ↔ tatsächliche Coverage). **Top-1-Hebel.**

2. **Story Bundles + pgvector** — Memory: `story_bundles_proposal.md`.
   ~5–7 Tage. Skaliert Press-Output Faktor 3–5. Setzt #1 voraus.

3. **Multi-User wiring** — H8 hat das Schema gelegt
   (`users`, `user_settings`, RLS enabled). Wiring fehlt: Supabase Auth
   integration + per-row RLS-Policies + Settings-UI von localStorage auf
   `user_settings` umstellen. ~2–3 Tage.

4. **MeisterTask-Integration (one-way push)** — Memory:
   `meistertask_integration.md`. Statt eigene Kanban-UI zu bauen
   (Editorial Pipeline #1), pushen wir hochbewertete Pubs als Tasks in
   ein bestehendes MeisterTask-Projekt der Pressestelle. Senken den
   Build-Aufwand drastisch und treffen den realen Workflow der
   Press-Officer (die MeisterTask schon kennen). Wechselwirkung mit #1:
   wenn MeisterTask der Pipeline-Träger wird, ist die `pitch_log`-Tabelle
   nur noch Spiegel für Outcome-Metrik. **API-Research erledigt** —
   Memory hat: Auth via PAT (nie ablaufend), Base-URL + 9 Endpoint-Mappings,
   Task-Create-Schema, Mapping `publication → task` mit Markdown-Notes
   + Score-Band-Labels, Dedup via `meistertask_task_id`-Spalte (kein
   Idempotency-Header), 12-File MVP-Plan, ~1.5–2 Tage Aufwand.
   Hard-Constraints: keine nativen Webhooks (Two-way-Sync = polling oder
   Zapier), Custom-Fields nur in Business-Plan, Rate-Limit ~5 rps
   defensiv (undocumented). Vor Start: 6 Klärungsfragen in der Memory.

Niedriger priorisierte aber konkrete Vorschläge aus dem Review (siehe
HANDOVER.md-Vorgängerantworten oder `git log` für die Architektur-Antwort):

- Researcher mobility — `person_orgunits` temporal versionieren
  (heute current-state only, falsche Zuordnung wenn jemand Institut wechselt)
- `publication_oestat6_matview` Refresh-Policy — TODO-Kommentar in
  IMPLEMENTATION.md, kein Trigger oder Refresh-Schedule
- DOI-Dedup beim Import (Preprint vs. Published als doppelte Pubs)
- Re-weighting Slider in `/analysis` — heute ein toter UI-Stub, entweder
  killen oder zu „benannten Gewichts-Profilen" persistieren
- ELIGIBILITY-Server-Liste in `app/api/publications/route.ts` importiert
  jetzt (H7) aus `lib/eligibility.ts` — das war der letzte Drift-Vektor

---

## Useful Context für eine fresh session

**Working dir:** `/home/mleihs/dev/oeaw-press-release`

**Local Supabase ports** (siehe Memory `local_supabase_ports.md`):
- API (Kong): `http://localhost:54421`
- Postgres: `postgres://postgres:postgres@localhost:54422/postgres`
- Studio: `http://localhost:54423`

**Dev server:** `npm run dev` → `http://localhost:3000` (Auth-Gate aktiv)

**Re-login Auth-Cookie:**
```bash
curl -c /tmp/cookies.txt -X POST -H "Content-Type: application/json" \
  -d '{"password":"movefastandbreakthings"}' \
  http://localhost:3000/api/auth/gate
```

**Smoke-Test (8 Pages):**
```bash
for url in / /analysis /publications /researchers /settings /upload \
  "/publications/479f418a-64f2-4870-a44c-a1e76d3ad6ff" \
  "/persons/efc5f4d8-365e-4790-8496-29acc821b389"; do
  code=$(curl -s -b /tmp/cookies.txt -o /dev/null -w "%{http_code}" "http://localhost:3000$url")
  echo "$code $url"
done
```

**Production-DB-Sicherheit:** lokal hat KEINE Analysis-Daten; PROD schon
(siehe Memory `production_db_safety.md`). Niemals ETL gegen PROD laufen.

---

## Cross-references

| Was | Wo |
|---|---|
| Source-of-truth-Map (welcher Fakt wo lebt) | `IMPLEMENTATION.md` Section 2 |
| Schema (chronologisch) | `supabase/migrations/*.sql` |
| Migration-Rollback-Cookbook | `supabase/ROLLBACK.md` |
| Researchers-Feature-Design | `RESEARCHERS_PLAN.md` |
| Score-Weights canonical | `lib/score-weights.json` |
| Memory-Files (auto-loaded jede Session) | `~/.claude/projects/-home-mleihs-dev-oeaw-press-release/memory/` |
| Scoring-Session-Logbuch (User-side, nicht Tech) | `HANDOVER.md` |
| CI-Workflow | `.github/workflows/ci.yml` |
