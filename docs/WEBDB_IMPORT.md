# WebDB Import — TYPO3 MySQL → Postgres

This document describes how ÖAW's TYPO3-based WebDB is mirrored into
the StoryScout Postgres schema via `scripts/webdb-import.mjs`.

The import is non-destructive (UPSERT-only), idempotent (safe to
re-run), and ~20 s on a full ~38k-publication corpus.

> **One dump, two consumers.** The same TYPO3 MySQL dump also feeds the
> events feature. `scripts/webdb-import.mjs` reads the `tx_hebowebdb_*`
> tables (publications); `npm run sync-events` reads `tx_news_domain_model_news`
> + `pages` (events) from the *same* container. Export the whole `oeaw`
> DB once and run both. See `docs/EVENTS_FEATURE.md` for the events side.

## Source

ÖAW WebDB is a TYPO3 extension. The export is a MySQL dump
(~1 GB gzip-compressed) covering:

| Source area | Source tables (TYPO3) |
|---|---|
| Publications | `tx_hebowebdb_domain_model_publication` (+ junctions) |
| Persons | `tx_hebowebdb_domain_model_person` |
| Organisational units | `tx_hebowebdb_domain_model_orgunit` |
| External units | `tx_hebowebdb_domain_model_extunit` |
| Projects | `tx_hebowebdb_domain_model_project` |
| Lectures | `tx_hebowebdb_domain_model_lecture` |
| Science taxonomy (ÖSTAT-6) | `tx_hebowebdb_domain_model_oestat6` |
| Publication types | `tx_hebowebdb_domain_model_publicationtype` |

The live install uses the **`tx_hebowebdb_*`** prefix (not the
`tx_aoewebdb_*` seen in some older notes). The exact `SELECT`s live in
`scripts/webdb-import.mjs`; the events path reads `tx_news_domain_model_news`
+ `pages` (see `lib/server/ingest/adapters/typo3-events.ts`).

## Running it end-to-end

The dump can't be read directly — the importer reads a *live* MySQL, so
the dump is first loaded into a throwaway container.

```bash
# 0. Local Supabase up (target Postgres on :54422)
supabase start

# 1. Export the whole `oeaw` DB from T3Adminer (Format SQL, Output gzip).
#    The Export toolbar icon is missing — open the export page via URL:
#    …/t3adminer.php?lang=default&db=oeaw&server=oeaw-db%3A3306&username=oeawUser&dump=
#    Save as oeaw.sql.gz.

# 2. MySQL container on :54499 (db `webdb`, root/root — the importer defaults)
docker run -d --name oeaw-webdb-mysql \
  -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=webdb \
  -p 54499:3306 mysql:8.0 --skip-log-bin --max-allowed-packet=512M
gzip -dc oeaw.sql.gz | docker exec -i oeaw-webdb-mysql mysql --force -uroot -proot webdb

# 3. Publications → local Postgres (one transaction, ~20 s)
node scripts/webdb-import.mjs

# 4. Events → local Postgres (same container)
npm run sync-events

# 5. Enrichment (publications only; headless, resumable, free)
npm run backfill-venue
npx tsx scripts/backfill-journal.ts --since=2024-01-01
npm run enrich-all

# 6. Scoring of the new pubs — session-based (see the re-import runbook).
#    Writes llm_model = 'anthropic/claude-opus-4.8-session' (SESSION_MODEL_TAG).
#    Older batches carry the 4.7-generation tag; stats match the pattern
#    'anthropic/claude-opus-%-session' so the writer tag can change per model.

# 7. Push to PRODUCTION — local is canonical, prod is brought up to date.
#    ALWAYS back up prod first (see "Pushing to production" below). Run in THIS
#    order: analysis first (scores onto existing rows), then the row sync
#    (INSERTs brand-new rows, which already carry their local scores).
node scripts/push-analysis-to-prod.mjs --apply        # fill scores on existing prod rows
node scripts/sync-missing-pubs-to-prod.mjs --apply    # INSERT new rows + relations (auto-copies new authors)
npm run sync-events:prod                               # new events, if any

# 8. Press-news DOI match — pull current OeAW Pressemeldungen from TYPO3 into
#    press_releases (orphans) + promote DOI matches to publications ("schon
#    released" signal). Repeatable + idempotent (ON CONFLICT DO NOTHING). Run
#    local AND prod (dry-run by default; --apply writes; runs promote in-tx).
node scripts/import-press-news.mjs --apply              # local
node scripts/import-press-news.mjs --target=prod --apply

# 9. SPECTER2 press-similarity embeddings for the new pubs. Runs AFTER step 8 so
#    the orphan set is final before the centroid / press_similarity refresh.
#    Idempotent (hash-skip); embeddings live only in prod; --since scopes the
#    publications pass to this import's window (orphans pass always runs).
scripts/embeddings/.venv/bin/python scripts/embeddings/compute-embeddings.py \
  --target=prod --since=<import-year>-01-01

# 10. Cleanup
docker stop oeaw-webdb-mysql && docker rm oeaw-webdb-mysql
```

> ⚠️ **Use `node scripts/webdb-import.mjs`, not `npm run webdb-import:v2`.**
> The `webdb-import-v2.ts` variant has an unfixed bind-parameter bug on the
> ~37k-row publication batch and will fail. The `.mjs` is the hardened,
> maintained importer.

Connection overrides (defaults shown) are read from env:
`MYSQL_HOST=127.0.0.1`, `MYSQL_PORT=54499`, `MYSQL_USER=root`,
`MYSQL_PASSWORD=root`, `MYSQL_DATABASE=webdb`,
`PG_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54422/postgres`.
The events sync reads the same container via the `WEBDB_MYSQL_*` vars in
`.env.local`.

## Target Schema

Each source area maps to a Postgres table in the StoryScout schema:

| Postgres table | Holds |
|---|---|
| `publications` | One row per publication; ~38k total |
| `persons` | Researchers with ORCID, e-mail, bio |
| `orgunits` | Institutes, divisions, with acronyms |
| `extunits` | External organisations |
| `projects` | Research projects with DE / EN summaries, funding type |
| `lectures` | Talks — keynotes, named lectures, etc. |
| `oestat6_categories` | 1411 Austrian science taxonomy codes |
| `publication_types` | TYPO3 lookup (Beitrag in Fachzeitschrift, etc.) |
| `person_publications`, `orgunit_publications`, `publication_projects` | M:N junctions |

The schema is defined in `supabase/migrations/`. **This is the
contract** — if you adapt the importer for a different CMS, target
the same shape.

## Field Mapping Highlights

Most fields are direct copies. Three areas have logic worth knowing:

### Title truncation at colon

TYPO3's `title` field only holds the part before the first `:`.
The subtitle lives only in the bibliographic-citation field. The
importer joins them where available, but legacy data may show
incomplete titles for entries with long subtitles. (Example: the
ÖAW AAR2 climate report's full title is recoverable only from
`citation`.)

### Decisions left in WebDB

Some fields the source CMS uses (`mahighlight`, internal flags) have
non-obvious semantics:

- **`mahighlight`** = Eigen-Highlight (the author flagged their own
  publication as notable). It does **not** mean "Academy member" —
  ~90% of `mahighlight=true` rows are from non-members.

### Lead-author column

A 2026-05-05 data-quality incident showed that a bad backfill
overwrote `lead_author` on 455 rows in the local DB while production
was unaffected. Recovery used a temp MySQL container + diff script
rather than a full re-import. The point: the importer treats
`lead_author` as an UPSERT target, and a bad source pass can corrupt
it — keep backups (or production-as-canonical) before bulk
operations.

## ETL Pipeline (step-by-step)

```
scripts/webdb-import.mjs
  │
  ├─ Read MySQL dump (mysql2)
  │
  ├─ For each source table:
  │    skip `t3ver_*` / mirror tables (TYPO3 versioning artefacts)
  │    skip rows with `deleted = 1`
  │
  ├─ For each row:
  │    map fields → Postgres column shape
  │    apply DOI fallback (see below)
  │    UPSERT on natural key
  │
  ├─ Junctions:
  │    Strategy: full-table replace (DELETE + INSERT) inside a tx
  │    Safer than per-row UPSERT for tables with no stable unique key
  │
  └─ Stats summary (rows added / updated / skipped)
```

After the publication import, run the enrichment + scoring pipeline
(see "Running it end-to-end" below).

## Natural Keys & DOI Fallback

`webdb_uid` (a stable integer from the TYPO3 schema) is the natural
key for publications. UPSERTs use it as the conflict target.

DOIs can live in 14 different TYPO3 fields, not just a dedicated
`doi` column:

- `doi` (where present)
- `endnote`, `ris`, `bibtex` (citation export formats)
- `citation`, `citation_*` (bibliographic-citation fields)
- URL fields (where the DOI is embedded in the path)
- A few legacy text fields where editors typed DOIs by hand

The extraction lives in `scripts/lib/doi-extract.mjs` — both the ETL
script and the orphan-backfill scripts share this code. The
URL-slug heuristic catches DOIs in TYPO3 URL fields where editors
saved a doi.org link.

## Idempotency & UPSERT

The importer is **non-destructive** (since 2026-04-30, hardened 2026-05):

- No `TRUNCATE` or row-deletes on the main tables
- All writes are `INSERT ... ON CONFLICT (natural_key) DO UPDATE`;
  analysis/enrichment columns are never in the `UPDATE` set, so a
  re-import leaves `press_score` and friends intact
- The **entire import runs in one transaction** — any failure rolls
  back to the exact prior state (not just the junctions)
- Every incoming DOI is **freed before the upsert**, because a DOI can
  move between `webdb_uid`s across exports (avoids unique-constraint
  collisions)
- A **dump-size guard** rejects an export smaller than 80 % of the
  current active corpus (guards against a truncated dump mass-archiving
  the DB); override with `--force`
- Publications absent from the dump are **archived, never deleted** —
  and a publication carrying a `press_score` is **never archived**, so
  editorial work stays visible even after it leaves the WebDB

Re-running the importer is safe and the recommended way to
synchronize new TYPO3 changes.

## Last-resort enrichment: title-exact external matching

The normal cascade (`enrich-all` / `enrich-retry`) is **DOI-driven** — a pub
with no DOI skips every source and stays `failed` instantly. For those,
`scripts/match-external-by-title.mjs` queries CrossRef + OpenAlex by **title**
and accepts a candidate ONLY on an **exact normalized-title match** (strip
HTML/entities, fold diacritics, lowercase, collapse non-alphanumerics),
corroborated by publication year (±1). On a hit it writes back the recovered
DOI and/or abstract — never `press_score`.

Guards that matter (learned 2026-06-02):
- **Generic-title trap**: `"Introduction" === "Introduction"` is exact but
  meaningless. Rejects <3-word titles and a front-matter blocklist
  (Einleitung/Vorwort/Editorial/Rezension/…).
- **DOI uniqueness**: a recovered DOI can collide with another row
  (`publications_doi_unique_not_null`) — duplicate WebDB records of one paper,
  or a DOI already in the DB. The DOI goes to the first claimant; duplicates
  still get the abstract, with `doi` left NULL.

```bash
node scripts/match-external-by-title.mjs --since=2026-01-01            # dry-run, audit matches by eye
node scripts/match-external-by-title.mjs --since=2026-01-01 --apply    # write back
```

Yield is modest and structural: most no-DOI `failed` rows are book reviews,
reports, German-language items genuinely absent from CrossRef/OpenAlex. Run
2026-06-02 recovered 51 pubs (2026: 12, H2-2025: 39); 28 of them gained a real
abstract and became scorable, the rest gained only a DOI (a second DOI-cascade
pass then found no further abstracts via Unpaywall/Semantic Scholar).

## Pushing to production (local → prod)

Local Postgres is canonical; prod is brought up to date afterwards.
**Prod typically lags one full re-import behind local** — a fresh import
lands new rows + new scores locally, but none of it reaches prod until an
explicit push. (Observed 2026-06-02: after the re-import, prod was still at
the prior state — 8 of 14 freshly-scored 2026 pubs and 22 events were
local-only.)

**Always back up prod first.** No `pg_dump` on PATH by default; libpq ships
one. Prod direct conn is IPv6-only — use the **session pooler** (port 5432),
which supports `pg_dump` (the transaction pooler on 6543 does not):

```bash
PGDUMP=/opt/homebrew/Cellar/libpq/*/bin/pg_dump   # or `brew install libpq`
URL=$(grep '^PROD_DB_URL_POOLER=' ~/.config/oeaw-press-release/prod-credentials | cut -d= -f2-)
$PGDUMP "$URL" --schema=public --no-owner --no-privileges | gzip > ~/oeaw-prod-backups/prod-public-$(date +%Y%m%d-%H%M%S).sql.gz
```

(Public schema = all app data incl. `publications`/`events`; Supabase-internal
schemas are covered by Supabase's own automated backups.)

A re-imported, locally-scored batch splits into **two populations in prod**,
which need **two different pushes**:

1. **Analysis-only push** — pubs that *already exist* in prod (from an earlier
   push) just need their score columns filled. Safe, reversible, idempotent:

   ```bash
   node scripts/push-analysis-to-prod.mjs --since=2026-01-01           # dry-run
   node scripts/push-analysis-to-prod.mjs --since=2026-01-01 --apply   # write
   ```

   Matches by `publications.id` (stable across imports). Guarded: won't clobber
   an existing prod score without `--overwrite`. Reports — but does **not**
   push — the missing rows.

2. **Full publication-row sync** — brand-new pubs *absent* from prod (by `id`)
   need a full row INSERT plus their relation rows. `push-analysis-to-prod.mjs`
   deliberately leaves these alone (it only UPDATEs) and lists what it skipped.
   Land them with the reusable, idempotent, transactional sync (**verified
   2026-06-02**):

   ```bash
   node scripts/sync-missing-pubs-to-prod.mjs            # dry-run (rolls back)
   node scripts/sync-missing-pubs-to-prod.mjs --apply    # write (single tx)
   ```

   In one prod transaction it:
   - computes the local `publications.id` set absent from prod;
   - **pre-flight**: asserts every referenced parent (`orgunits`, `persons`,
     `projects`) already exists in prod — ABORTS and lists them if not (in
     practice institutes/persons are stable across imports, so the missing
     count is 0 and only join rows are new);
   - INSERTs the missing `publications` rows (all columns), then their
     `orgunit_publications`, `person_publications`, `publication_projects`
     rows — all `ON CONFLICT DO NOTHING`, so it is safe to re-run;
   - does **not** sync `publication_embeddings` (press-similarity vectors — a
     separate, optional concern) and **never UPDATEs** existing prod rows, so
     prod-side decision/triage state cannot be clobbered.

**Order matters:** run the analysis push **first** (fills scores on rows that
already exist in prod), then the row sync (brings in the new rows, which already
carry their freshly-computed local scores). After both, prod == local.

**Events** lag the same way: `npm run sync-events:prod` (canonical; wraps
`scripts/sync-events.ts` against the prod target) lands them.

### Verifying prod is live (do this after every push)

Confirm prod matches local and is internally consistent:

- **Parity** — local and prod agree on `count(*)` and
  `count(*) FILTER (WHERE press_score IS NOT NULL)`, and **no local `id` is
  absent from prod** (chunk local ids and probe prod with `= ANY($1::uuid[])`).
- **Invariant** — on prod, zero rows with `analysis_status='analyzed' AND
  press_score IS NULL` (and zero of the reverse).
- **JSONB integrity** — every `jsonb` column on the synced rows must keep its
  JSON shape. node-postgres serializes a JS array/object param as a Postgres
  array literal (`{...}`), not JSON, so a naive copy turns `flag_notes`'s `[]`
  into the object `{}` — which then crashes `jsonb_array_length(flag_notes)`
  inside `pub_ids_with_flags()` and 500s the dashboard. `sync-missing-pubs-to-prod.mjs`
  guards against this (JSON-casts jsonb columns); verify with
  `SELECT jsonb_typeof(flag_notes), count(*) FROM publications GROUP BY 1`
  → only `array`, never `object`. (Hit 2026-06-02; root-caused + fixed.)
- **Metadata drift** — for rows present in both DBs, `published_at` /
  `lead_author` / `title` should agree. A re-import refreshes these locally; the
  row-sync does not touch existing rows, so a few may drift (observed
  2026-06-02: ≤2 rows — negligible). If a future import changes metadata for
  *many* already-present rows and that must reach prod, add a metadata-only
  UPDATE (`published_at`/`lead_author`/`title`) — **never** touch the analysis
  or decision columns.

> **2026-06-02 outcome.** After scoring 61 title-recovered pubs locally:
> analysis push updated 61 existing prod rows (prod scored 7724→7785); the
> row-sync then INSERTed 36 brand-new rows + 65/50/15 join rows (prod pubs
> 38,624→38,660, scored 7,785→7,797). Prod invariant clean, drift ≤2 rows —
> the re-import is **fully live and retrievable on prod**.

## Press-news DOI matching (`press_releases`)

OeAW main-site press releases (TYPO3 EXT:news, `sys_category` 64
"ÖAW-Pressemeldungen") that cite a paper DOI are the "schon released" signal.
`scripts/import-press-news.mjs` is the **repeatable** importer — the 2026-05-06
set was a one-time seed with no refresh path until this script, so press news
after ~mid-May 2026 never matched.

```bash
node scripts/import-press-news.mjs                      # dry-run → local
node scripts/import-press-news.mjs --apply              # write local
node scripts/import-press-news.mjs --target=prod --apply
```

- **Source**: `tx_news_domain_model_news` in `sys_category` 64 (DE originals,
  `sys_language_uid=0 l10n_parent=0`) + their EN l10n translations
  (`sys_language_uid=1`; cat 1748 "OeAW press release" carries no direct
  `sys_category_record_mm` links, so EN is reached via `l10n_parent`).
- **DOI** lives in the `event_information` editor block ("Auf einen Blick" —
  citation + `DOI: 10...`), NOT in `bodytext` (8 rows) or `teaser` (0). HTML
  entities (esp. `&nbsp;`) wrap the DOI and are decoded before extraction
  (reuses `scripts/lib/doi-extract.mjs`), else the pattern captures `...&nbsp`
  onto the DOI. EN rows without their own DOI inherit the parent DE row's DOI.
- **URL** `/news/<path_segment>` (de) | `/en/news/<path_segment>` (en);
  `released_at` = `DATE(FROM_UNIXTIME(datetime))`.
- **Write**: orphan `press_releases` (`publication_id` NULL), ON CONFLICT
  `(LOWER(doi), COALESCE(lang,''))` DO NOTHING (never touches an existing row),
  then `promote_press_release_orphans()` links any orphan whose DOI now matches
  a publication — one transaction, dry-run rolls back.
- Run **prod after the pub push** so the new pubs are present to match against.
  Promoting an orphan fires a trigger that deletes its now-stale orphan
  embedding, so the press-cluster stays consistent automatically.

## Press-similarity embeddings (SPECTER2)

`publication_embeddings` / `press_release_embeddings` feed the press-cluster
k-NN that materialises `publications.press_similarity`. They live **only in
prod** (local is the scoring workspace), and `sync-missing-pubs-to-prod.mjs`
does NOT copy them — so newly-scored pubs carry no embedding until the SPECTER2
pass runs against prod:

```bash
scripts/embeddings/.venv/bin/python scripts/embeddings/compute-embeddings.py \
  --target=prod --since=2026-01-01
```

- `--scope=analyzed` (default) embeds pubs that have a `press_score` or a
  `press_release` — exactly the cluster reference set. Do **not** widen to
  `--scope=all`; that pulls unscored pubs into the reference cluster.
- `--since=YYYY-MM-DD` scopes the publications pass to one import window; the
  orphan-press-release pass always runs. Hash-idempotent — safe to re-run.
- Run it **after** the press-news match (step 8) so the centroid +
  `press_similarity` refresh at the end reflects the final orphan set.

## Adapting for Other CMSs

The Postgres schema in `supabase/migrations/` is the contract.
To adapt for a different source CMS (DSpace, Pure, OJS, custom DB,
…):

1. Replace the MySQL connection + table reads in `webdb-import.mjs`
   with your source-reader
2. Map your source fields to the Postgres column names
3. Preserve the UPSERT-on-natural-key pattern — pick a stable
   field from your source as the natural key
4. Keep the DOI-fallback extraction (`scripts/lib/doi-extract.mjs`)
   — it's CMS-agnostic and saves a lot of enrichment misses

The downstream pipeline (enrichment, LLM analysis, embedding) reads
only from the Postgres schema — it doesn't care that the source
was TYPO3.
