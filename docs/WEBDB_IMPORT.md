# WebDB Import — TYPO3 MySQL → Postgres

This document describes how ÖAW's TYPO3-based WebDB is mirrored into
the StoryScout Postgres schema via `scripts/webdb-import.mjs`.

The import is non-destructive (UPSERT-only), idempotent (safe to
re-run), and ~1 minute on a full ~37k-publication corpus.

## Source

ÖAW WebDB is a TYPO3 extension. The export is a MySQL dump
(~660 MB uncompressed) covering:

| Source area | Source tables (TYPO3) |
|---|---|
| Publications | `tx_aoewebdb_domain_model_publication` (+ junctions) |
| Persons | `tx_aoewebdb_domain_model_person` |
| Organisational units | `tx_aoewebdb_domain_model_orgunit` |
| External units | `tx_aoewebdb_domain_model_extunit` |
| Projects | `tx_aoewebdb_domain_model_project` |
| Lectures | `tx_aoewebdb_domain_model_lecture` |
| Science taxonomy (ÖSTAT-6) | `tx_aoewebdb_domain_model_oestat6_category` |
| Publication types | `tx_aoewebdb_domain_model_publication_type` |

(Table prefixes may vary by installation — the script reads them as
configured via env.)

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

After the import, you typically run:

```bash
npm run enrich-orphans    # backfill orphan press_releases via APIs
```

The `enrich-free --apply` follow-up (mentioned in internal notes) is
the equivalent for publication rows that arrived with a non-empty
summary but no `enrichment_status` — without it, those rows get
stuck in `pending` forever.

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

The importer is **non-destructive** (since 2026-04-30):

- No `TRUNCATE` or row-deletes on the main tables
- All writes are `INSERT ... ON CONFLICT (natural_key) DO UPDATE`
- Junctions are wrapped in a transaction so partial failures roll
  back

Re-running the importer is safe and the recommended way to
synchronize new TYPO3 changes.

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
