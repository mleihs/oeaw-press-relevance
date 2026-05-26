# TYPO3 MySQL — read-only user grants

Minimal `SELECT`-only privileges for a dedicated app user that lets the
current code paths (`scripts/webdb-import.{mjs,v2}`,
`lib/server/ingest/adapters/webdb.ts`, `lib/server/ingest/adapters/typo3-events.ts`)
talk to the WEBDB MySQL without write access.

The app never `INSERT`s, `UPDATE`s or `DELETE`s against MySQL. The local
Postgres mirror is the only side that gets mutated.

## Tables enumerated by the code (24 total)

| Group | Tables | Read by |
|---|---|---|
| HeboWebDB lookups (5) | `tx_hebowebdb_domain_model_publicationtype`, `…_lecturetype`, `…_orgunittype`, `…_membertype`, `tx_hebowebdb_domain_model_oestat6` | webdb adapter + import.mjs |
| HeboWebDB entities (6) | `tx_hebowebdb_domain_model_orgunit`, `…_extunit`, `…_person`, `…_project`, `…_lecture`, `…_publication` | webdb adapter + import.mjs |
| HeboWebDB junctions (8) | `tx_hebowebdb_domain_model_personpublication`, `…_orgunitpublication`, `tx_hebowebdb_publication_project_mm`, `tx_hebowebdb_person_oestat6_mm`, `tx_hebowebdb_domain_model_lectureperson`, `tx_hebowebdb_lecture_orgunit_mm`, `tx_hebowebdb_project_lecture_mm`, `tx_hebowebdb_domain_model_extunitperson` | webdb adapter + import.mjs |
| HeboWebDB orgunit↔person (1) | `tx_hebowebdb_domain_model_orgunitperson` | webdb adapter |
| TYPO3 EXT:news + page tree (2) | `tx_news_domain_model_news`, `pages` | typo3-events adapter |
| TYPO3 EXT:news_eventnews lookups (2) | `tx_eventnews_domain_model_location`, `tx_eventnews_domain_model_organizer` | typo3-events adapter (LEFT JOIN fallback; current OEAW data uses the `location_simple` / `organizer_simple` columns on `tx_news_domain_model_news` instead, but the JOIN still needs SELECT) |

## GRANT statements

Replace `<YOUR_STRONG_PASSWORD>` and the `webdb` DB name if your install
differs. The `'%'` host restricts to anywhere — tighten to the app host
in production (e.g. `'app-host.internal'`).

```sql
CREATE USER IF NOT EXISTS 'oeaw_app_ro'@'%' IDENTIFIED BY '<YOUR_STRONG_PASSWORD>';

-- HeboWebDB lookup tables
GRANT SELECT ON `webdb`.`tx_hebowebdb_domain_model_publicationtype` TO 'oeaw_app_ro'@'%';
GRANT SELECT ON `webdb`.`tx_hebowebdb_domain_model_lecturetype`     TO 'oeaw_app_ro'@'%';
GRANT SELECT ON `webdb`.`tx_hebowebdb_domain_model_orgunittype`     TO 'oeaw_app_ro'@'%';
GRANT SELECT ON `webdb`.`tx_hebowebdb_domain_model_membertype`      TO 'oeaw_app_ro'@'%';
GRANT SELECT ON `webdb`.`tx_hebowebdb_domain_model_oestat6`         TO 'oeaw_app_ro'@'%';

-- HeboWebDB entities
GRANT SELECT ON `webdb`.`tx_hebowebdb_domain_model_orgunit`     TO 'oeaw_app_ro'@'%';
GRANT SELECT ON `webdb`.`tx_hebowebdb_domain_model_extunit`     TO 'oeaw_app_ro'@'%';
GRANT SELECT ON `webdb`.`tx_hebowebdb_domain_model_person`      TO 'oeaw_app_ro'@'%';
GRANT SELECT ON `webdb`.`tx_hebowebdb_domain_model_project`     TO 'oeaw_app_ro'@'%';
GRANT SELECT ON `webdb`.`tx_hebowebdb_domain_model_lecture`     TO 'oeaw_app_ro'@'%';
GRANT SELECT ON `webdb`.`tx_hebowebdb_domain_model_publication` TO 'oeaw_app_ro'@'%';

-- HeboWebDB junction tables
GRANT SELECT ON `webdb`.`tx_hebowebdb_domain_model_personpublication`  TO 'oeaw_app_ro'@'%';
GRANT SELECT ON `webdb`.`tx_hebowebdb_domain_model_orgunitpublication` TO 'oeaw_app_ro'@'%';
GRANT SELECT ON `webdb`.`tx_hebowebdb_publication_project_mm`          TO 'oeaw_app_ro'@'%';
GRANT SELECT ON `webdb`.`tx_hebowebdb_person_oestat6_mm`               TO 'oeaw_app_ro'@'%';
GRANT SELECT ON `webdb`.`tx_hebowebdb_domain_model_lectureperson`      TO 'oeaw_app_ro'@'%';
GRANT SELECT ON `webdb`.`tx_hebowebdb_lecture_orgunit_mm`              TO 'oeaw_app_ro'@'%';
GRANT SELECT ON `webdb`.`tx_hebowebdb_project_lecture_mm`              TO 'oeaw_app_ro'@'%';
GRANT SELECT ON `webdb`.`tx_hebowebdb_domain_model_extunitperson`      TO 'oeaw_app_ro'@'%';
GRANT SELECT ON `webdb`.`tx_hebowebdb_domain_model_orgunitperson`      TO 'oeaw_app_ro'@'%';

-- TYPO3 News + page tree (events feature)
GRANT SELECT ON `webdb`.`tx_news_domain_model_news` TO 'oeaw_app_ro'@'%';
GRANT SELECT ON `webdb`.`pages`                     TO 'oeaw_app_ro'@'%';

-- TYPO3 EXT:news_eventnews lookups (LEFT JOIN fallback in typo3-events)
GRANT SELECT ON `webdb`.`tx_eventnews_domain_model_location`  TO 'oeaw_app_ro'@'%';
GRANT SELECT ON `webdb`.`tx_eventnews_domain_model_organizer` TO 'oeaw_app_ro'@'%';

FLUSH PRIVILEGES;
```

## Notes

- **No `GRANT ALL`** — every privilege the app needs is `SELECT`.
- **`pages` is TYPO3 core**, not a `tx_*` extension table. Required for
  the recursive CTE in `typo3-events.ts` that derives the institute label
  from the page tree.
- **Sub-queries / CTEs**: every table referenced anywhere in the SQL
  (including inside `WITH RECURSIVE` self-joins on `pages` and the
  `LEFT JOIN` on the eventnews lookups) is covered above. Missing one
  surfaces as a `SELECT command denied to user…` at sync time, not at
  schema-grant time — so prefer all-or-nothing.
- **If table prefixes ever change** (the comment in `docs/WEBDB_IMPORT.md`
  notes that `tx_hebowebdb_*` was `tx_aoewebdb_*` historically), re-grep
  the codebase for the new prefix and update this file.
- **Audit query** for the live DB:
  ```sql
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'webdb'
    AND table_name LIKE 'tx_hebowebdb_%'
       OR table_name IN ('tx_news_domain_model_news', 'pages',
                         'tx_eventnews_domain_model_location',
                         'tx_eventnews_domain_model_organizer');
  ```
