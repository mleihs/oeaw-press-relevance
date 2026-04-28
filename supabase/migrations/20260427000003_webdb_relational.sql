-- WebDB relational schema. Mirrors the OeAW WebDB (TYPO3) source
-- and binds it to our enrichment/analysis layer via the existing
-- `publications` table (extended additively).

-- ============================================================
-- 1. Lookup tables
-- ============================================================

CREATE TABLE publication_types (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webdb_uid    INTEGER NOT NULL UNIQUE,
  name_de      TEXT    NOT NULL,
  name_en      TEXT    NOT NULL
);

CREATE TABLE lecture_types (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webdb_uid    INTEGER NOT NULL UNIQUE,
  name_de      TEXT    NOT NULL,
  name_en      TEXT    NOT NULL
);

CREATE TABLE orgunit_types (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webdb_uid    INTEGER NOT NULL UNIQUE,
  name_de      TEXT    NOT NULL,
  name_en      TEXT    NOT NULL
);

CREATE TABLE member_types (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webdb_uid    INTEGER NOT NULL UNIQUE,
  name_de      TEXT    NOT NULL,
  name_en      TEXT    NOT NULL
);

-- Austrian 6-digit science classification (1,411 codes).
-- The 6-digit uid encodes hierarchy: first 3 = field, next 2 = subfield, last 1 = leaf.
CREATE TABLE oestat6_categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webdb_uid    INTEGER NOT NULL UNIQUE, -- e.g. 101001 = Algebra
  oestat3      INTEGER GENERATED ALWAYS AS (webdb_uid / 1000) STORED,
  name_de      TEXT    NOT NULL,
  name_en      TEXT    NOT NULL
);
CREATE INDEX idx_oestat6_oestat3 ON oestat6_categories (oestat3);

-- ============================================================
-- 2. Core entities
-- ============================================================

CREATE TABLE orgunits (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webdb_uid          INTEGER NOT NULL UNIQUE,
  name_de            TEXT    NOT NULL,
  name_en            TEXT,
  akronym_de         TEXT,
  akronym_en         TEXT,
  url_de             TEXT,
  url_en             TEXT,
  type_id            UUID REFERENCES orgunit_types(id) ON DELETE SET NULL,
  parent_webdb_uid   INTEGER, -- resolved to FK after import
  parent_id          UUID REFERENCES orgunits(id) ON DELETE SET NULL,
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_orgunits_parent ON orgunits (parent_id);
CREATE INDEX idx_orgunits_akronym ON orgunits (akronym_de);
CREATE INDEX idx_orgunits_name_trgm ON orgunits USING gin (name_de gin_trgm_ops);

CREATE TABLE extunits (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webdb_uid          INTEGER NOT NULL UNIQUE,
  name_de            TEXT    NOT NULL,
  name_en            TEXT,
  logo               TEXT,
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE persons (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webdb_uid                INTEGER NOT NULL UNIQUE,
  firstname                TEXT    NOT NULL,
  lastname                 TEXT    NOT NULL,
  degree_before            TEXT,
  degree_after             TEXT,
  degree_non_academic_de   TEXT,
  degree_non_academic_en   TEXT,
  biography_de             TEXT,
  biography_en             TEXT,
  email                    TEXT,
  email_en                 TEXT,
  external_link_de         TEXT,
  external_link_en         TEXT,
  portrait                 TEXT,
  copyright                TEXT,
  orcid                    TEXT,
  slug                     TEXT,
  oestat3_name_de          TEXT,
  oestat3_name_en          TEXT,
  research_field_no_oestat TEXT,
  research_fields          TEXT,
  selected_publications    TEXT,
  member_type_id           UUID REFERENCES member_types(id) ON DELETE SET NULL,
  external                 BOOLEAN NOT NULL DEFAULT FALSE,
  deceased                 BOOLEAN NOT NULL DEFAULT FALSE,
  date_of_death            DATE,
  vip_de                   TEXT,
  vip_en                   TEXT,
  use_vip                  BOOLEAN NOT NULL DEFAULT FALSE,
  selectionyear            INTEGER,
  synced_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_persons_name_trgm ON persons USING gin ((firstname || ' ' || lastname) gin_trgm_ops);
CREATE INDEX idx_persons_lastname ON persons (lastname);
CREATE INDEX idx_persons_orcid ON persons (orcid) WHERE orcid IS NOT NULL AND orcid <> '';
CREATE INDEX idx_persons_email ON persons (email) WHERE email IS NOT NULL AND email <> '';
CREATE INDEX idx_persons_external ON persons (external);
CREATE INDEX idx_persons_deceased ON persons (deceased);

CREATE TABLE projects (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webdb_uid           INTEGER NOT NULL UNIQUE,
  title_de            TEXT,
  title_en            TEXT,
  summary_de          TEXT,
  summary_en          TEXT,
  url_de              TEXT,
  url_en              TEXT,
  thematic_focus_de   TEXT,
  thematic_focus_en   TEXT,
  funding_type_de     TEXT,
  funding_type_en     TEXT,
  starts_on           DATE,
  ends_on             DATE,
  cancelled           BOOLEAN NOT NULL DEFAULT FALSE,
  type_text           TEXT, -- projecttype lookup empty in source; keep raw
  parent_webdb_uid    INTEGER,
  parent_id           UUID REFERENCES projects(id) ON DELETE SET NULL,
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_projects_active ON projects (ends_on) WHERE cancelled = FALSE;
CREATE INDEX idx_projects_title_de_trgm ON projects USING gin (title_de gin_trgm_ops);
CREATE INDEX idx_projects_parent ON projects (parent_id);

CREATE TABLE lectures (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webdb_uid          INTEGER NOT NULL UNIQUE,
  original_title     TEXT    NOT NULL,
  lecture_date       DATE,
  city               TEXT,
  event_name         TEXT,
  event_type         TEXT,
  kind               TEXT,
  type_id            UUID REFERENCES lecture_types(id) ON DELETE SET NULL,
  popular_science    BOOLEAN NOT NULL DEFAULT FALSE,
  speaker            TEXT,
  citation           TEXT,
  url                TEXT,
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_lectures_date ON lectures (lecture_date DESC);
CREATE INDEX idx_lectures_popular_science ON lectures (popular_science) WHERE popular_science = TRUE;
CREATE INDEX idx_lectures_title_trgm ON lectures USING gin (original_title gin_trgm_ops);

-- ============================================================
-- 3. Extend publications additively. Old fields stay for backwards
--    compatibility; new fields get populated by the WebDB importer.
-- ============================================================

ALTER TABLE publications ADD COLUMN webdb_uid              INTEGER;
ALTER TABLE publications ADD COLUMN original_title         TEXT;
ALTER TABLE publications ADD COLUMN summary_de             TEXT;
ALTER TABLE publications ADD COLUMN summary_en             TEXT;
ALTER TABLE publications ADD COLUMN peer_reviewed          BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE publications ADD COLUMN popular_science        BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE publications ADD COLUMN open_access_status     TEXT; -- oa_gold | oa_postprint | oa_preprint | nicht_oacc | ''
ALTER TABLE publications ADD COLUMN lead_author            TEXT;
ALTER TABLE publications ADD COLUMN website_link           TEXT;
ALTER TABLE publications ADD COLUMN download_link          TEXT;
ALTER TABLE publications ADD COLUMN doi_link               TEXT; -- raw form (e.g. http://dx.doi.org/...)
ALTER TABLE publications ADD COLUMN ris                    TEXT;
ALTER TABLE publications ADD COLUMN bibtex                 TEXT;
ALTER TABLE publications ADD COLUMN endnote                TEXT;
ALTER TABLE publications ADD COLUMN citation_apa           TEXT;
ALTER TABLE publications ADD COLUMN citation_cbe           TEXT;
ALTER TABLE publications ADD COLUMN citation_harvard       TEXT;
ALTER TABLE publications ADD COLUMN citation_mla           TEXT;
ALTER TABLE publications ADD COLUMN citation_vancouver     TEXT;
ALTER TABLE publications ADD COLUMN citation_de            TEXT;
ALTER TABLE publications ADD COLUMN citation_en            TEXT;
ALTER TABLE publications ADD COLUMN publication_type_id    UUID REFERENCES publication_types(id) ON DELETE SET NULL;
ALTER TABLE publications ADD COLUMN webdb_tstamp           TIMESTAMPTZ; -- source last-modified
ALTER TABLE publications ADD COLUMN webdb_crdate           TIMESTAMPTZ; -- source created
ALTER TABLE publications ADD COLUMN archived               BOOLEAN NOT NULL DEFAULT FALSE; -- soft-delete reconciled from dump
ALTER TABLE publications ADD COLUMN synced_at              TIMESTAMPTZ;

-- Postgres allows multiple NULLs in a regular UNIQUE constraint by default,
-- and ON CONFLICT can target a non-partial unique index without quoting the
-- predicate. Keep it simple.
CREATE UNIQUE INDEX publications_webdb_uid_unique ON publications (webdb_uid);
CREATE INDEX idx_pub_popular_science ON publications (popular_science) WHERE popular_science = TRUE;
CREATE INDEX idx_pub_peer_reviewed ON publications (peer_reviewed) WHERE peer_reviewed = TRUE;
CREATE INDEX idx_pub_archived ON publications (archived) WHERE archived = TRUE;
CREATE INDEX idx_pub_type ON publications (publication_type_id);

-- ============================================================
-- 4. Junction tables (many-to-many)
-- ============================================================

CREATE TABLE person_publications (
  person_id       UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  publication_id  UUID NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  highlight       BOOLEAN NOT NULL DEFAULT FALSE,
  mahighlight     BOOLEAN NOT NULL DEFAULT FALSE, -- Akademie-member highlight
  authorship      TEXT, -- HauptautorIn | KoautorIn | AlleinautorIn | ?
  sorting         INTEGER,
  PRIMARY KEY (person_id, publication_id)
);
CREATE INDEX idx_person_pubs_pub ON person_publications (publication_id);
CREATE INDEX idx_person_pubs_highlight ON person_publications (publication_id) WHERE highlight = TRUE OR mahighlight = TRUE;

CREATE TABLE orgunit_publications (
  orgunit_id      UUID NOT NULL REFERENCES orgunits(id) ON DELETE CASCADE,
  publication_id  UUID NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  highlight       BOOLEAN NOT NULL DEFAULT FALSE,
  sorting         INTEGER,
  PRIMARY KEY (orgunit_id, publication_id)
);
CREATE INDEX idx_orgunit_pubs_pub ON orgunit_publications (publication_id);

CREATE TABLE publication_projects (
  publication_id  UUID NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sorting         INTEGER,
  PRIMARY KEY (publication_id, project_id)
);
CREATE INDEX idx_pub_projects_project ON publication_projects (project_id);

CREATE TABLE person_oestat6 (
  person_id       UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  oestat6_id      UUID NOT NULL REFERENCES oestat6_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (person_id, oestat6_id)
);
CREATE INDEX idx_person_oestat6_oestat6 ON person_oestat6 (oestat6_id);

CREATE TABLE lecture_persons (
  lecture_id      UUID NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  person_id       UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  sorting         INTEGER,
  PRIMARY KEY (lecture_id, person_id)
);
CREATE INDEX idx_lecture_persons_person ON lecture_persons (person_id);

CREATE TABLE lecture_orgunits (
  lecture_id      UUID NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  orgunit_id      UUID NOT NULL REFERENCES orgunits(id) ON DELETE CASCADE,
  sorting         INTEGER,
  PRIMARY KEY (lecture_id, orgunit_id)
);
CREATE INDEX idx_lecture_orgunits_orgunit ON lecture_orgunits (orgunit_id);

CREATE TABLE project_lectures (
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  lecture_id      UUID NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  sorting         INTEGER,
  PRIMARY KEY (project_id, lecture_id)
);
CREATE INDEX idx_project_lectures_lecture ON project_lectures (lecture_id);

CREATE TABLE extunit_persons (
  extunit_id      UUID NOT NULL REFERENCES extunits(id) ON DELETE CASCADE,
  person_id       UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  sorting         INTEGER,
  PRIMARY KEY (extunit_id, person_id)
);
CREATE INDEX idx_extunit_persons_person ON extunit_persons (person_id);

CREATE TABLE orgunit_persons (
  orgunit_id      UUID NOT NULL REFERENCES orgunits(id) ON DELETE CASCADE,
  person_id       UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  role            TEXT,
  phone           TEXT,
  scientist       BOOLEAN NOT NULL DEFAULT FALSE,
  sorting         INTEGER,
  PRIMARY KEY (orgunit_id, person_id)
);
CREATE INDEX idx_orgunit_persons_person ON orgunit_persons (person_id);

-- ============================================================
-- 5. RLS — match the existing publications policy for now
--    (tightening is deferred until P0.5 / Phase 0 finish-up).
-- ============================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'publication_types','lecture_types','orgunit_types','member_types',
    'oestat6_categories','orgunits','extunits','persons','projects','lectures',
    'person_publications','orgunit_publications','publication_projects',
    'person_oestat6','lecture_persons','lecture_orgunits','project_lectures',
    'extunit_persons','orgunit_persons'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY "Allow all access" ON %I
        FOR ALL USING (true) WITH CHECK (true)
    $f$, t);
  END LOOP;
END$$;
