# PROD_SETUP_PLAN — OeAW Press-Triage Production Hydration

**Erstellt:** 2026-04-30 (Session-Bridge nach `/clear`)
**Goal:** Production von broken-flat-Schema auf aktuellen Stand bringen, mit MeisterTask-Integration
**Strategie:** Variante α — Wipe + frisch aufbauen, lokal als Source-of-Truth

---

## Ausgangslage (vor /clear festgehalten)

| Komponente | Stand |
|---|---|
| **Production-Supabase** | `https://duqybyxpgghietjbrxnc.supabase.co` (project ref: `duqybyxpgghietjbrxnc`). Hat NUR `publications` (33,499 rows, flat-pre-relational-Schema) + 1 Backup-Tabelle. Keine `persons`, `orgunits`, `users`, etc. Keine `haiku`-Spalte oder Per-Dimension-Scores. |
| **Vercel-Production-URL** | `https://oeaw-press-relevance-a66syh4d5-matthias-leihs-projects.vercel.app` |
| **Vercel Auto-Deploy** | aktiv via `vercel[bot]` GitHub-Integration auf `main` |
| **Lokal** | 37,282 Pubs, 7,148 analyzed (Obermenge von prod), alle Migrations applied, Schema vollständig |
| **Repo lokal** | 7 Commits ahead of `origin/main` (H10 + MT1, MT2, MT1b, MT3, MT4, MT5, MT6) |
| **MeisterTask DEV** | Project 9147401, Inbox 37295389, Labels 12284892/12284890, PAT in `.env.local` |
| **Memory-Stand** | `production_db_safety.md` IST FALSCH — sagt prod hat live analysis history, aber lokal ist tatsächlich Source-of-Truth |

## User-Entscheidungen (Session 2026-04-30)

| # | Entscheidung | Wahl |
|---|---|---|
| 1 | Backup-Strategie | **(b) pg_dump** vor Wipe (kein Pro-Plan, kein PITR) |
| 2 | MeisterTask-Project in Prod | **(i) gleich wie DEV** (9147401) — Pressestelle macht noch nichts |
| 3 | PAT in Prod | **(i) gleicher wie DEV** — OK für jetzt, später rotierbar |
| 4 | Sonstige Vercel-Env-Vars | **selbst via CLI verifizieren** — Schritt 0 nächste Session |

---

## Schritt 0 — ✅ ERLEDIGT in Session 2026-04-30

- ✅ Vercel CLI installiert, eingeloggt als `mleihs`
- ✅ Repo-Link: `matthias-leihs-projects/oeaw-press-release` → `.vercel/project.json` gesetzt
- ✅ GitHub-Repo connected
- ✅ Env-Vars-Verifikation gelaufen → **CRITICAL FINDING: Vercel-Production hat KEINE Env-Vars gesetzt** (`No Environment Variables found`)

### Was das bedeutet

- Production-App läuft seit Monaten **ohne SUPABASE_URL, ohne OPENROUTER_API_KEY, ohne GATE_PASSWORD/TOKEN, ohne irgendwas.**
- Builds sind grün, weil Next.js env-vars erst zur Runtime liest. Die App ist faktisch broken bei jedem User-Klick — niemand merkt's, weil niemand Production aktiv nutzt.
- Konsequenz: PROD-4 wird **alle 13 Env-Vars setzen**, nicht nur die 5 MT-spezifischen.

---

## PROD-1: Backup + Verify

### 1a. Production-DB Connection-String holen

User holt aus Supabase-Studio → Project Settings → Database → **Connection String** (Direct Connection oder Transaction Pooler):

```
postgresql://postgres.<project-ref>:<PASSWORD>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
```

oder Direct:

```
postgresql://postgres:<PASSWORD>@db.duqybyxpgghietjbrxnc.supabase.co:5432/postgres
```

→ Speichern als shell-var `PROD_DB_URL` (nicht in Files schreiben).

### 1b. Backup mit pg_dump

```bash
mkdir -p ~/oeaw-prod-backups
pg_dump "$PROD_DB_URL" --no-owner --no-acl \
  | gzip > ~/oeaw-prod-backups/prod-pre-wipe-$(date +%Y%m%d-%H%M%S).sql.gz
ls -lh ~/oeaw-prod-backups/
```

→ Verify Backup-File ≥ 50 MB (33k pubs sollten so groß sein).

### 1c. Vercel Env-Vars verifizieren

(Setzt PROD-Schritt-0 voraus.) `npx vercel env ls --environment production` — Liste mit obigen 8 erwarteten vergleichen.

**Stop-Punkt:** User confirmt Backup ≥ 50 MB existiert + alle Env-Vars sind da.

---

## PROD-2: Wipe + alle Migrations apply

### 2a. Wipe public schema (via MCP)

```sql
DROP TABLE IF EXISTS publications_analysis_backup_20260220 CASCADE;
DROP TABLE IF EXISTS publications CASCADE;
-- restliche Tabellen existieren in Production gar nicht erst
```

→ via `mcp__supabase__execute_sql`. **Doppelt prüfen mit `mcp__supabase__list_tables` dass public schema leer ist.**

### 2b. Migrations sequentiell anwenden

Reihenfolge aus `ls supabase/migrations/`:

```
20260217133923_create_publications_table.sql
20260217134027_move_pg_trgm_to_extensions_v2.sql
20260217142237_reset_bad_enrichment_data.sql
20260427xxxxxx_*.sql  (alle weiteren in chronologischer Reihenfolge)
20260428xxxxxx_*.sql
20260429000001_perf_indices.sql
20260429000002_filter_helper_functions.sql
20260429000003_publication_score_stats.sql
20260429000004_users_stub.sql
20260429000005_meistertask_task_id.sql        ← MT
20260429000006_meistertask_task_token.sql     ← MT
```

Pro Migration:
1. `cat supabase/migrations/<file>.sql`
2. `mcp__supabase__apply_migration` mit `name=<base>` (snake_case) + `query=<content>`
3. Falls fail: stop, debug, ggf. roll-forward-fix

**Stop-Punkt nach jeweils 5 Migrations** — `mcp__supabase__list_tables` zeigt was bislang da ist.

**Erwartet am Ende:** ~12 Tables (publications + 5 lookup + 4 junctions + 2 user-stub) + materialized view + Postgres-Functions + RLS-Policies.

### 2c. Schema-Verify

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
-- soll matchen mit lokal:
-- supabase db query "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;"
```

---

## PROD-3: Daten-Migration local → production

### 3a. Local pg_dump (data only)

```bash
PGPASSWORD=postgres pg_dump \
  -h 127.0.0.1 -p 54422 -U postgres -d postgres \
  --data-only --schema=public \
  --disable-triggers \
  > /tmp/local-data-export.sql
ls -lh /tmp/local-data-export.sql
# Erwartet ~50-150 MB für 37k pubs + relationen
```

`--disable-triggers` umgeht problematische Triggers während des Imports (RLS-Policy-Triggers etc.).

### 3b. Restore zu Production

```bash
psql "$PROD_DB_URL" < /tmp/local-data-export.sql 2>&1 | tail -50
```

**Watch out for:**
- ERROR-Meldungen (constraint violations, FK errors)
- Sequence-Out-of-Sync warnings — sind ok
- Unique-Constraint-Violations — würden auf Schema-Drift hinweisen, dann stop

### 3c. Counts vergleichen

```sql
-- prod (via mcp__supabase__execute_sql):
SELECT
  (SELECT COUNT(*) FROM publications) AS pubs,
  (SELECT COUNT(*) FROM publications WHERE press_score IS NOT NULL) AS analyzed,
  (SELECT COUNT(*) FROM persons) AS persons,
  (SELECT COUNT(*) FROM orgunits) AS orgunits;
-- expect: pubs=37282, analyzed=7148, persons≈XXX, orgunits≈XXX
```

→ Wenn Counts matchen mit local: PROD-3 done.

---

## PROD-4: Vercel-Env-Vars für ALLE Vars (nicht nur MeisterTask!)

Production hat aktuell NULL Env-Vars. Alle 13 müssen gesetzt werden.

### Sicher gleich wie lokal (aus `.env.local`)

```
GATE_PASSWORD=movefastandbreakthings
GATE_TOKEN=902c557df7cb32b8ef3ba8bdf05370f1312de1a0494216c220759f9b1bef8f50
MEISTERTASK_API_TOKEN=e53bTB6CzsgwqDn91GdT-2AifjU84ynVcFGdI5lMkNw
MEISTERTASK_PROJECT_ID=9147401
MEISTERTASK_DEFAULT_SECTION_ID=37295389
MEISTERTASK_HIGH_LABEL_ID=12284892
MEISTERTASK_MID_LABEL_ID=12284890
```

### Production-spezifisch (NICHT lokal — User muss bereitstellen)

```
SUPABASE_URL=https://duqybyxpgghietjbrxnc.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://duqybyxpgghietjbrxnc.supabase.co
SUPABASE_ANON_KEY=sb_publishable_UY1_7L8ps4nO3g26iT1EfQ_gjgATOcW
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_UY1_7L8ps4nO3g26iT1EfQ_gjgATOcW
# (modern publishable key, via mcp__supabase__get_publishable_keys ermittelt)
SUPABASE_SERVICE_ROLE_KEY=<Production-service-role-Key aus Supabase-Studio → Project Settings → API → "service_role" key>
OPENROUTER_API_KEY=<Production OpenRouter Key, ggf. derselbe wie lokal>
```

**Hinweis:** `GATE_PASSWORD` bleibt für Production temporär gleich wie lokal (`movefastandbreakthings`). Production ist erstmal nur ein Build-Test-Target, keine echte Pressestelle-Nutzung. Wenn das später real wird: rotieren.

### Set-Befehl pattern

Für jede Var:
```bash
echo "<value>" | npx vercel env add <NAME> production
# oder Dashboard: vercel.com/<org>/<project>/settings/environment-variables → Add New
```

Verify am Ende:
```bash
npx vercel env ls production
# muss alle 13 listen
```

---

## PROD-5: git push + Auto-Deploy + Smoke-Test

### 5a. Push

```bash
git push origin main
# Auto-Deploy startet
gh api "repos/mleihs/oeaw-press-relevance/deployments" --jq '.[0]'
# Watch deployment status
```

Warte auf `state: "success"` im deployment-status (~1-3 min).

### 5b. Smoke-Test

```bash
# Cookie holen (GATE_PASSWORD aus Vercel-Dashboard)
PROD_URL="https://oeaw-press-relevance-a66syh4d5-matthias-leihs-projects.vercel.app"
curl -c /tmp/prod-cookies.txt -X POST -H "Content-Type: application/json" \
  -d "{\"password\":\"<GATE_PASSWORD>\"}" \
  "$PROD_URL/api/auth/gate"

# 8 Pages durchklicken
TEST_PUB="50f9a0c8-7f9e-44b4-a722-12c10579fcb9"  # Pandemic Babies, Score 0.84
TEST_PERSON_ID="<einer aus prod>"
for url in / /analysis /publications /researchers /settings /upload \
           "/publications/$TEST_PUB" "/persons/$TEST_PERSON_ID"; do
  code=$(curl -s -b /tmp/prod-cookies.txt -o /dev/null -w "%{http_code}" "$PROD_URL$url")
  echo "$code $url"
done

# MT-Push triggern
curl -s -b /tmp/prod-cookies.txt -X POST -H "Content-Type: application/json" \
  -d "{\"publication_id\":\"$TEST_PUB\"}" \
  "$PROD_URL/api/meistertask/push"
```

**Erwartet:**
- Alle 8 Pages 200
- MT-Push: `status: "already_pushed"` (weil pub schon einen task_id hat aus DEV-Smoke-Test)
- Plus: in der Pubs-Liste sollte Indikator-Icon sichtbar sein

---

## PROD-6: Memory-Updates

### `production_db_safety.md` — komplette Korrektur

```markdown
---
name: Production DB safety — local is source-of-truth
type: feedback
---

After 2026-04-30 production-rebuild: **local Supabase is source of truth**.
Production was rebuilt from scratch (alle Migrations + pg_dump-restore from local).
Both DBs should now have identical schema and identical data, but if they
drift, **local wins**.

- Webdb-ETL läuft against local first; later rebuilt to prod via dump-restore
- Never apply destructive ETL against prod without first re-syncing local

(Vorher hieß diese Memory: "prod has live analysis history, local has none" —
das war zur Zeit der WebDB-ETL-Welle korrekt, ist nach der Hydration falsch.)
```

### `meistertask_integration.md` — Status-Update

Section "Status" auf:
```
✅ MVP shipped 2026-04-29 (MT1-MT6)
✅ Production deployed 2026-04-30 (PROD-1 bis PROD-6)
```

Plus: DEV-IDs werden nun auch in Production verwendet (siehe Wahl 2(i)).

### `MEMORY.md` — Index-Update

Pointer auf `meistertask_integration.md` reflektiert Production-Stand.

---

## Risk-Matrix

| Risiko | Wahrscheinlichkeit | Mitigation |
|---|---|---|
| Backup-Wiederherstellung nötig | low | pg_dump aus PROD-1 ist da |
| Migration-fail mid-apply | low | Sequentiell + Stop-Punkt nach 5 |
| Daten-Import schlägt fehl bei Schema-Drift | **medium** | Schema-Verify in PROD-2c vor Import |
| FK-Constraint-Violations beim Import | medium | `--disable-triggers` im pg_dump; bei Fehler chunkweise |
| Vercel-Deploy 500 nach Push (env-vars fehlen) | medium | PROD-4 muss vor PROD-5 sein |
| Smoke-Test 500 auf Pub-Detail | low | wenn alle Migrations applied + Daten da: muss gehen |

---

## Stop-Punkte (User-Confirmation)

1. Nach Schritt 0 (Vercel CLI login)
2. Nach PROD-1c (Backup verified, Env-Vars verified)
3. Nach PROD-2c (Schema matches lokal)
4. Nach PROD-3c (Data-Counts matchen)
5. Nach PROD-4 (5 MT-Env-Vars set)
6. Nach PROD-5b (Smoke-Test alle grün)

---

## Wichtige Werte (Quick-Reference)

| Was | Wert |
|---|---|
| Production-Supabase-URL | `https://duqybyxpgghietjbrxnc.supabase.co` |
| Production-Vercel-URL | `https://oeaw-press-relevance-a66syh4d5-matthias-leihs-projects.vercel.app` |
| Lokale-Postgres-URL | `postgresql://postgres:postgres@127.0.0.1:54422/postgres` |
| MeisterTask-Project | 9147401 (Press-Triage DEV) |
| MeisterTask-Inbox | 37295389 |
| MeisterTask-Labels | 12284892 (Hoch), 12284890 (Mittel) |
| Test-Pubs (post-import) | `50f9a0c8-...` (Pandemic Babies), `8f339c4a-...` (Bust to boom), `57d7ab36-...` (Gender gaps) |

---

## Erwartetes Ergebnis

- Production = lokal (Schema + Daten)
- App alle 8 Pages funktionieren in Production
- MT-Push-Button funktioniert in Production
- Memory ist konsistent
- 7 commits gepusht zu origin/main
