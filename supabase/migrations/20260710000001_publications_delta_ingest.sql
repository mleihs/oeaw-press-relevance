-- Inkrementeller Publications-Delta-Import — DB-residente Logik.
--
-- OeAW liefert unter /fileadmin/exports/publications_incremental_change_2.json
-- ein echtes Delta der rohen TYPO3-Tabellen (records_to_delete +
-- records_to_add_or_update, gruppiert nach publication/person/personpublication/
-- orgunitpublication). Diese Migration bildet die GESAMTE relationale
-- Apply-Logik in Postgres ab (Vorgabe: „alle Logik, die in Postgres gehört,
-- gehört nach Postgres"):
--
--   1. ingest_runs           — Cursor/High-Water-Mark je Feed (Idempotenz).
--   2. refresh_publication_ita_subtree(uuid[])
--                            — is_ita_subtree-Recompute als EINE wiederverwendbare
--                              Funktion (löst das bisher in webdb-import.mjs:508
--                              inline duplizierte Prädikat ab); scoped via id-Array,
--                              global bei NULL.
--   3. apply_publications_delta(payload jsonb, opts jsonb) -> report jsonb
--                            — atomarer Delta-Apply: Deletes, Upserts (Upsert per
--                              webdb_uid), FK-Auflösung als INNER JOIN, Junction-
--                              Delete per Composite-Key, Archivierung (nie hart
--                              gelöscht), Scored-Retention, Orphan-Zählung, Guards,
--                              is_ita-Recompute (scoped), Bestands-Backfills,
--                              Cursor-Fortschreibung. Ein `SELECT apply_...` ist
--                              als ein Statement all-or-nothing.
--
-- Werte-Normalisierung (DOI-Extraktion, Datums-/Sentinel-Handling, In-Batch-
-- DOI-Dedupe) passiert BEWUSST vorgelagert in TS (scripts/lib/doi-extract.mjs
-- single-sourced mit dem Runtime-Backfill) und wird als fertig-normalisiertes
-- jsonb übergeben — diese Funktion macht ausschließlich Relationales.

-- ---------------------------------------------------------------------------
-- 1. Cursor / Run-Protokoll
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingest_runs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed                    text        NOT NULL,
  generated_at_timestamp  bigint      NOT NULL,
  generated_at_readable   text,
  applied_at              timestamptz NOT NULL DEFAULT now(),
  status                  text        NOT NULL DEFAULT 'applied',
  source_label            text,
  report                  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ingest_runs_status_check CHECK (status IN ('applied', 'skipped', 'failed')),
  CONSTRAINT ingest_runs_feed_gen_unique UNIQUE (feed, generated_at_timestamp)
);

CREATE INDEX IF NOT EXISTS idx_ingest_runs_feed_ts
  ON ingest_runs (feed, generated_at_timestamp DESC);

COMMENT ON TABLE ingest_runs IS
  'Cursor + Run-Report je Ingest-Feed. UNIQUE(feed, generated_at_timestamp) macht ein Delta idempotent (Skip-if-applied). Ein Zeitstempel-Sprung > Feed-Kadenz signalisiert einen verpassten Zyklus (Lossy-Feed) → Voll-Reconciliation.';

ALTER TABLE ingest_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY anon_select ON ingest_runs FOR SELECT TO anon USING (true);

-- ---------------------------------------------------------------------------
-- 2. is_ita_subtree-Recompute — single source of truth
-- ---------------------------------------------------------------------------
-- Prädikat identisch zur Initial-Backfill-Migration (20260501000001) und der
-- bisher in webdb-import.mjs inline geführten Fassung. p_ids = betroffene
-- publication-ids (scoped, für Delta) oder NULL (global, für Voll-Import).
CREATE OR REPLACE FUNCTION refresh_publication_ita_subtree(p_ids uuid[] DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_count int;
BEGIN
  WITH ita_pubs AS (
    SELECT DISTINCT op.publication_id AS pid
    FROM orgunit_publications op
    JOIN orgunits o ON o.id = op.orgunit_id
    WHERE o.akronym_de ILIKE 'ITA%'
  )
  UPDATE publications p
  SET is_ita_subtree = (p.id IN (SELECT pid FROM ita_pubs))
  WHERE (p_ids IS NULL OR p.id = ANY (p_ids))
    AND p.is_ita_subtree IS DISTINCT FROM (p.id IN (SELECT pid FROM ita_pubs));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION refresh_publication_ita_subtree IS
  'Recompute publications.is_ita_subtree (true iff via orgunit_publications an ITA-Akronym). Scoped auf p_ids, global bei NULL. Single source für Voll-Import + Delta.';

-- ---------------------------------------------------------------------------
-- 3. Atomarer Delta-Apply
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_publications_delta(
  p_payload jsonb,
  p_opts    jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_feed          text    := p_opts->>'feed';
  v_force         boolean := COALESCE((p_opts->>'force')::boolean, false);
  v_keep_scored   boolean := COALESCE((p_opts->>'keep_scored_on_delete')::boolean, false);
  v_max_pubs      int     := COALESCE((p_opts->>'max_delta_pubs')::int, 2000);
  v_max_persons   int     := COALESCE((p_opts->>'max_delta_persons')::int, 20000);
  v_source_label  text    := p_opts->>'source_label';

  v_gen_ts        bigint  := (p_payload->'meta'->>'generated_at_timestamp')::bigint;
  v_gen_readable  text    := p_payload->'meta'->>'generated_at_readable';
  v_up            jsonb   := COALESCE(p_payload->'upsert', '{}'::jsonb);
  v_del           jsonb   := COALESCE(p_payload->'delete', '{}'::jsonb);

  v_n_pub         int     := COALESCE(jsonb_array_length(v_up->'publications'), 0);
  v_n_person      int     := COALESCE(jsonb_array_length(v_up->'persons'), 0);

  v_now           timestamptz := now();
  v_affected      uuid[];

  -- counters
  v_pubs_upserted        int := 0;
  v_pubs_archived        int := 0;
  v_persons_upserted     int := 0;
  v_persons_deleted      int := 0;
  v_persons_del_skipped  int := 0;
  v_pp_upserted          int := 0;
  v_pp_deleted           int := 0;
  v_pp_orphans           int := 0;
  v_op_upserted          int := 0;
  v_op_deleted           int := 0;
  v_op_orphans           int := 0;
  v_ita_flipped          int := 0;
  v_unresolved_ptype     int := 0;
  v_unresolved_mtype     int := 0;
  v_matview_dirty        boolean := false;
  v_report               jsonb;
BEGIN
  IF v_feed IS NULL OR v_feed = '' THEN
    RAISE EXCEPTION 'apply_publications_delta: opts.feed is required';
  END IF;
  IF v_gen_ts IS NULL THEN
    RAISE EXCEPTION 'apply_publications_delta: payload.meta.generated_at_timestamp is required';
  END IF;

  -- Single-Flight je Feed: serialisiert überlappende Cron-Läufe desselben Feeds
  -- (Transaktions-Lock, wird bei Commit/Rollback freigegeben) — verhindert
  -- Doppel-Apply-Races und Deadlocks zwischen zwei gleichzeitigen Deltas.
  PERFORM pg_advisory_xact_lock(hashtext('apply_publications_delta:' || v_feed));

  -- Idempotenz: bereits angewandtes (feed, generated_at_timestamp) → Skip.
  IF EXISTS (
    SELECT 1 FROM ingest_runs
    WHERE feed = v_feed AND generated_at_timestamp = v_gen_ts AND status = 'applied'
  ) THEN
    RETURN jsonb_build_object(
      'status', 'skipped', 'feed', v_feed,
      'generated_at_timestamp', v_gen_ts, 'reason', 'already_applied');
  END IF;

  -- Guard: „incremental" ist heimlich zum Volldump geworden → fail-closed.
  IF v_n_pub > v_max_pubs AND NOT v_force THEN
    RAISE EXCEPTION 'apply_publications_delta: % publications exceeds max_delta_pubs=% (looks like a full dump) — pass force to override', v_n_pub, v_max_pubs;
  END IF;
  IF v_n_person > v_max_persons AND NOT v_force THEN
    RAISE EXCEPTION 'apply_publications_delta: % persons exceeds max_delta_persons=% — pass force to override', v_n_person, v_max_persons;
  END IF;

  -- =========================================================================
  -- DELETES zuerst (FK-sicher: Junction-Deletes und Entitäts-Deletes vor den
  -- Upserts, damit ein add+delete-desselben-Schlüssels delete-wins bliebe).
  -- =========================================================================

  -- (a) Person-Deletes: HART löschen (persons hat keine archived-Spalte;
  --     Cascade räumt person_publications), ABER niemals eine Person, die an
  --     einer press-gescorten Pub hängt (editorischer Kontext bleibt erhalten).
  WITH req AS (
    SELECT (value)::int AS uid
    FROM jsonb_array_elements_text(COALESCE(v_del->'persons', '[]'::jsonb)) AS value
  ),
  target AS (
    SELECT p.id
    FROM persons p
    JOIN req ON req.uid = p.webdb_uid
    WHERE NOT EXISTS (
      SELECT 1 FROM person_publications pp
      JOIN publications pub ON pub.id = pp.publication_id
      WHERE pp.person_id = p.id AND pub.press_score IS NOT NULL
    )
  ),
  done AS (
    DELETE FROM persons WHERE id IN (SELECT id FROM target) RETURNING 1
  )
  SELECT count(*) INTO v_persons_deleted FROM done;

  -- übersprungene (geschützte) Person-Deletes = angefragt & existiert noch
  SELECT count(*) INTO v_persons_del_skipped
  FROM persons p
  JOIN (
    SELECT (value)::int AS uid
    FROM jsonb_array_elements_text(COALESCE(v_del->'persons', '[]'::jsonb)) AS value
  ) req ON req.uid = p.webdb_uid;

  IF v_persons_deleted > 0 THEN v_matview_dirty := true; END IF;

  -- (b) Publication-Deletes (+ deletedInline vom Adapter): SOFT-ARCHIVE.
  --     Nie hart löschen (Cascade + Analyse-Erhalt). Explizites Delete
  --     archiviert auch gescorte Pubs (Analyse-Spalten bleiben erhalten),
  --     außer keep_scored_on_delete lässt sie sichtbar.
  WITH req AS (
    SELECT (value)::int AS uid
    FROM jsonb_array_elements_text(COALESCE(v_del->'publications', '[]'::jsonb)) AS value
  ),
  upd AS (
    UPDATE publications p
    SET archived = true, synced_at = v_now
    FROM req
    WHERE p.webdb_uid = req.uid
      AND p.archived = false
      AND (v_keep_scored = false OR p.press_score IS NULL)
    RETURNING p.id
  )
  SELECT count(*) INTO v_pubs_archived FROM upd;

  -- =========================================================================
  -- UPSERTS
  -- =========================================================================

  -- (c) Personen — Upsert per webdb_uid; member_type_id via LEFT JOIN aufgelöst.
  WITH src AS (
    SELECT * FROM jsonb_to_recordset(COALESCE(v_up->'persons', '[]'::jsonb)) AS x(
      webdb_uid int, firstname text, lastname text,
      degree_before text, degree_after text,
      degree_non_academic_de text, degree_non_academic_en text,
      biography_de text, biography_en text, email text, email_en text,
      external_link_de text, external_link_en text, portrait text, copyright text,
      orcid text, slug text, oestat3_name_de text, oestat3_name_en text,
      research_field_no_oestat text, research_fields text, selected_publications text,
      member_type_webdb_uid int, external boolean, deceased boolean,
      date_of_death date, vip_de text, vip_en text, use_vip boolean, selectionyear int
    )
  ),
  ins AS (
    INSERT INTO persons (
      webdb_uid, firstname, lastname, degree_before, degree_after,
      degree_non_academic_de, degree_non_academic_en, biography_de, biography_en,
      email, email_en, external_link_de, external_link_en, portrait, copyright,
      orcid, slug, oestat3_name_de, oestat3_name_en, research_field_no_oestat,
      research_fields, selected_publications, member_type_id, external, deceased,
      date_of_death, vip_de, vip_en, use_vip, selectionyear, synced_at
    )
    SELECT
      s.webdb_uid, COALESCE(s.firstname, ''), COALESCE(s.lastname, ''),
      s.degree_before, s.degree_after, s.degree_non_academic_de, s.degree_non_academic_en,
      s.biography_de, s.biography_en, s.email, s.email_en,
      s.external_link_de, s.external_link_en, s.portrait, s.copyright,
      s.orcid, s.slug, s.oestat3_name_de, s.oestat3_name_en, s.research_field_no_oestat,
      s.research_fields, s.selected_publications, mt.id,
      COALESCE(s.external, false), COALESCE(s.deceased, false),
      s.date_of_death, s.vip_de, s.vip_en, COALESCE(s.use_vip, false), s.selectionyear, v_now
    FROM src s
    LEFT JOIN member_types mt ON mt.webdb_uid = s.member_type_webdb_uid
    ON CONFLICT (webdb_uid) DO UPDATE SET
      firstname = EXCLUDED.firstname, lastname = EXCLUDED.lastname,
      degree_before = EXCLUDED.degree_before, degree_after = EXCLUDED.degree_after,
      degree_non_academic_de = EXCLUDED.degree_non_academic_de,
      degree_non_academic_en = EXCLUDED.degree_non_academic_en,
      biography_de = EXCLUDED.biography_de, biography_en = EXCLUDED.biography_en,
      email = EXCLUDED.email, email_en = EXCLUDED.email_en,
      external_link_de = EXCLUDED.external_link_de, external_link_en = EXCLUDED.external_link_en,
      portrait = EXCLUDED.portrait, copyright = EXCLUDED.copyright,
      orcid = EXCLUDED.orcid, slug = EXCLUDED.slug,
      oestat3_name_de = EXCLUDED.oestat3_name_de, oestat3_name_en = EXCLUDED.oestat3_name_en,
      research_field_no_oestat = EXCLUDED.research_field_no_oestat,
      research_fields = EXCLUDED.research_fields, selected_publications = EXCLUDED.selected_publications,
      member_type_id = EXCLUDED.member_type_id, external = EXCLUDED.external,
      deceased = EXCLUDED.deceased, date_of_death = EXCLUDED.date_of_death,
      vip_de = EXCLUDED.vip_de, vip_en = EXCLUDED.vip_en, use_vip = EXCLUDED.use_vip,
      selectionyear = EXCLUDED.selectionyear, synced_at = EXCLUDED.synced_at
    RETURNING 1
  )
  SELECT count(*) INTO v_persons_upserted FROM ins;

  SELECT count(*) INTO v_unresolved_mtype
  FROM jsonb_to_recordset(COALESCE(v_up->'persons', '[]'::jsonb)) AS s(member_type_webdb_uid int)
  LEFT JOIN member_types mt ON mt.webdb_uid = s.member_type_webdb_uid
  WHERE s.member_type_webdb_uid IS NOT NULL AND mt.id IS NULL;

  -- (d) DOI-Free: jede eingehende DOI vorab freigeben, egal welcher webdb_uid
  --     sie hält — der webdb_uid-Upsert setzt danach jede Pub-DOI aus der
  --     Payload neu (In-Batch-Dedupe ist bereits im Adapter passiert).
  WITH incoming AS (
    SELECT DISTINCT (x->>'doi') AS doi
    FROM jsonb_array_elements(COALESCE(v_up->'publications', '[]'::jsonb)) AS x
    WHERE nullif(x->>'doi', '') IS NOT NULL
  )
  UPDATE publications p
  SET doi = NULL, synced_at = v_now
  FROM incoming
  WHERE p.doi = incoming.doi;

  -- (e) Publikationen — Upsert per webdb_uid; publication_type_id via LEFT JOIN.
  --     archived=false ⇒ Re-Add ent-archiviert. webdb_tstamp/webdb_crdate sind
  --     NICHT im Feed → NICHT im Update-Set (sonst würden Voll-Import-Werte
  --     genullt). Analyse-/Decision-/is_ita-Spalten bleiben unberührt.
  WITH src AS (
    SELECT * FROM jsonb_to_recordset(COALESCE(v_up->'publications', '[]'::jsonb)) AS x(
      webdb_uid int, title text, original_title text, summary_de text, summary_en text,
      doi text, doi_link text, published_at date, ris text, publication_type_webdb_uid int,
      peer_reviewed boolean, popular_science boolean, open_access_status text,
      open_access boolean, oa_type text, lead_author text, website_link text, download_link text,
      citation_apa text, citation_de text, citation_en text, bibtex text, endnote text, citation text
    )
  ),
  ins AS (
    INSERT INTO publications (
      webdb_uid, title, original_title, summary_de, summary_en, doi, doi_link,
      published_at, ris, publication_type_id, peer_reviewed, popular_science,
      open_access_status, open_access, oa_type, lead_author, website_link, download_link,
      citation_apa, citation_de, citation_en, bibtex, endnote, citation, archived, synced_at
    )
    SELECT
      s.webdb_uid, COALESCE(s.title, '(untitled)'), s.original_title, s.summary_de, s.summary_en,
      s.doi, s.doi_link, s.published_at, s.ris, pt.id,
      COALESCE(s.peer_reviewed, false), COALESCE(s.popular_science, false),
      s.open_access_status, COALESCE(s.open_access, false), s.oa_type,
      s.lead_author, s.website_link, s.download_link,
      s.citation_apa, s.citation_de, s.citation_en, s.bibtex, s.endnote, s.citation,
      false, v_now
    FROM src s
    LEFT JOIN publication_types pt ON pt.webdb_uid = s.publication_type_webdb_uid
    ON CONFLICT (webdb_uid) DO UPDATE SET
      title = EXCLUDED.title, original_title = EXCLUDED.original_title,
      summary_de = EXCLUDED.summary_de, summary_en = EXCLUDED.summary_en,
      doi = EXCLUDED.doi, doi_link = EXCLUDED.doi_link, published_at = EXCLUDED.published_at,
      ris = EXCLUDED.ris, publication_type_id = EXCLUDED.publication_type_id,
      peer_reviewed = EXCLUDED.peer_reviewed, popular_science = EXCLUDED.popular_science,
      open_access_status = EXCLUDED.open_access_status, open_access = EXCLUDED.open_access,
      oa_type = EXCLUDED.oa_type, lead_author = EXCLUDED.lead_author,
      website_link = EXCLUDED.website_link, download_link = EXCLUDED.download_link,
      citation_apa = EXCLUDED.citation_apa, citation_de = EXCLUDED.citation_de,
      citation_en = EXCLUDED.citation_en, bibtex = EXCLUDED.bibtex, endnote = EXCLUDED.endnote,
      citation = EXCLUDED.citation, archived = EXCLUDED.archived, synced_at = EXCLUDED.synced_at
    RETURNING 1
  )
  SELECT count(*) INTO v_pubs_upserted FROM ins;

  SELECT count(*) INTO v_unresolved_ptype
  FROM jsonb_to_recordset(COALESCE(v_up->'publications', '[]'::jsonb)) AS s(publication_type_webdb_uid int)
  LEFT JOIN publication_types pt ON pt.webdb_uid = s.publication_type_webdb_uid
  WHERE s.publication_type_webdb_uid IS NOT NULL AND pt.id IS NULL;

  -- =========================================================================
  -- JUNCTIONS — Upsert per Composite-Key (kein TRUNCATE); Endpunkte per INNER
  -- JOIN auf webdb_uid aufgelöst (nicht auflösbar ⇒ fällt raus = Orphan).
  -- =========================================================================

  -- (f) person_publications Upsert
  WITH src AS (
    SELECT * FROM jsonb_to_recordset(COALESCE(v_up->'person_publications', '[]'::jsonb)) AS x(
      person_webdb_uid int, publication_webdb_uid int,
      highlight boolean, mahighlight boolean, authorship text
    )
  ),
  resolved AS (
    SELECT pe.id AS person_id, pu.id AS publication_id,
           COALESCE(s.highlight, false) AS highlight,
           COALESCE(s.mahighlight, false) AS mahighlight, s.authorship
    FROM src s
    JOIN persons pe ON pe.webdb_uid = s.person_webdb_uid
    JOIN publications pu ON pu.webdb_uid = s.publication_webdb_uid
  ),
  ins AS (
    INSERT INTO person_publications (person_id, publication_id, highlight, mahighlight, authorship)
    SELECT person_id, publication_id, highlight, mahighlight, authorship FROM resolved
    ON CONFLICT (person_id, publication_id) DO UPDATE SET
      highlight = EXCLUDED.highlight, mahighlight = EXCLUDED.mahighlight,
      authorship = EXCLUDED.authorship
    RETURNING 1
  )
  SELECT count(*) INTO v_pp_upserted FROM ins;

  SELECT count(*) INTO v_pp_orphans
  FROM jsonb_to_recordset(COALESCE(v_up->'person_publications', '[]'::jsonb)) AS s(person_webdb_uid int, publication_webdb_uid int)
  LEFT JOIN persons pe ON pe.webdb_uid = s.person_webdb_uid
  LEFT JOIN publications pu ON pu.webdb_uid = s.publication_webdb_uid
  WHERE pe.id IS NULL OR pu.id IS NULL;

  IF v_pp_upserted > 0 THEN v_matview_dirty := true; END IF;

  -- (g) orgunit_publications Upsert (neue Orgunit-Stammsätze kommen NICHT über
  --     den Feed ⇒ eine Junction auf eine unbekannte Org-Einheit ist Orphan).
  WITH src AS (
    SELECT * FROM jsonb_to_recordset(COALESCE(v_up->'orgunit_publications', '[]'::jsonb)) AS x(
      orgunit_webdb_uid int, publication_webdb_uid int, highlight boolean
    )
  ),
  resolved AS (
    SELECT o.id AS orgunit_id, pu.id AS publication_id, COALESCE(s.highlight, false) AS highlight
    FROM src s
    JOIN orgunits o ON o.webdb_uid = s.orgunit_webdb_uid
    JOIN publications pu ON pu.webdb_uid = s.publication_webdb_uid
  ),
  ins AS (
    INSERT INTO orgunit_publications (orgunit_id, publication_id, highlight)
    SELECT orgunit_id, publication_id, highlight FROM resolved
    ON CONFLICT (orgunit_id, publication_id) DO UPDATE SET highlight = EXCLUDED.highlight
    RETURNING 1
  )
  SELECT count(*) INTO v_op_upserted FROM ins;

  SELECT count(*) INTO v_op_orphans
  FROM jsonb_to_recordset(COALESCE(v_up->'orgunit_publications', '[]'::jsonb)) AS s(orgunit_webdb_uid int, publication_webdb_uid int)
  LEFT JOIN orgunits o ON o.webdb_uid = s.orgunit_webdb_uid
  LEFT JOIN publications pu ON pu.webdb_uid = s.publication_webdb_uid
  WHERE o.id IS NULL OR pu.id IS NULL;

  -- (h) Junction-Deletes per Composite-Key
  WITH d AS (
    SELECT * FROM jsonb_to_recordset(COALESCE(v_del->'person_publications', '[]'::jsonb)) AS x(
      person_webdb_uid int, publication_webdb_uid int)
  ),
  res AS (
    SELECT pe.id AS person_id, pu.id AS publication_id
    FROM d JOIN persons pe ON pe.webdb_uid = d.person_webdb_uid
           JOIN publications pu ON pu.webdb_uid = d.publication_webdb_uid
  ),
  del AS (
    DELETE FROM person_publications pp USING res
    WHERE pp.person_id = res.person_id AND pp.publication_id = res.publication_id
    RETURNING 1
  )
  SELECT count(*) INTO v_pp_deleted FROM del;
  IF v_pp_deleted > 0 THEN v_matview_dirty := true; END IF;

  WITH d AS (
    SELECT * FROM jsonb_to_recordset(COALESCE(v_del->'orgunit_publications', '[]'::jsonb)) AS x(
      orgunit_webdb_uid int, publication_webdb_uid int)
  ),
  res AS (
    SELECT o.id AS orgunit_id, pu.id AS publication_id
    FROM d JOIN orgunits o ON o.webdb_uid = d.orgunit_webdb_uid
           JOIN publications pu ON pu.webdb_uid = d.publication_webdb_uid
  ),
  del AS (
    DELETE FROM orgunit_publications op USING res
    WHERE op.orgunit_id = res.orgunit_id AND op.publication_id = res.publication_id
    RETURNING 1
  )
  SELECT count(*) INTO v_op_deleted FROM del;

  -- =========================================================================
  -- Abgeleitete Logik (DB-resident)
  -- =========================================================================

  -- is_ita_subtree scoped auf betroffene Pubs (upsertete + solche mit
  -- geänderten/gelöschten Orgunit-Links).
  SELECT array_agg(DISTINCT p.id) INTO v_affected
  FROM publications p
  WHERE p.webdb_uid IN (
    SELECT (x->>'webdb_uid')::int FROM jsonb_array_elements(COALESCE(v_up->'publications', '[]'::jsonb)) x
    UNION
    SELECT (x->>'publication_webdb_uid')::int FROM jsonb_array_elements(COALESCE(v_up->'orgunit_publications', '[]'::jsonb)) x
    UNION
    SELECT (x->>'publication_webdb_uid')::int FROM jsonb_array_elements(COALESCE(v_del->'orgunit_publications', '[]'::jsonb)) x
  );
  IF v_affected IS NOT NULL AND array_length(v_affected, 1) > 0 THEN
    v_ita_flipped := refresh_publication_ita_subtree(v_affected);
  END IF;

  -- Bestands-Backfills + Press-Release-Promotion (idempotent, wiederverwendete
  -- DB-Funktionen; eine frisch importierte Pub soll sofort konsistent sein).
  -- NUR wenn tatsächlich etwas geändert wurde — bei leerem/no-op-Delta (häufig
  -- im Cron) keine unnötigen globalen Scans/Writes.
  IF (v_pubs_upserted + v_pubs_archived + v_persons_upserted + v_persons_deleted
      + v_pp_upserted + v_pp_deleted + v_op_upserted + v_op_deleted) > 0 THEN
    PERFORM backfill_lead_author_from_persons();
    PERFORM backfill_published_at_from_text();
    PERFORM promote_press_release_orphans_logged(v_feed);
  END IF;

  -- =========================================================================
  -- Cursor fortschreiben (atomar mit den Datenänderungen)
  -- =========================================================================
  v_report := jsonb_build_object(
    'pubs_upserted', v_pubs_upserted,
    'pubs_archived', v_pubs_archived,
    'persons_upserted', v_persons_upserted,
    'persons_deleted', v_persons_deleted,
    'persons_delete_skipped', v_persons_del_skipped,
    'person_links_upserted', v_pp_upserted,
    'person_links_deleted', v_pp_deleted,
    'person_link_orphans', v_pp_orphans,
    'orgunit_links_upserted', v_op_upserted,
    'orgunit_links_deleted', v_op_deleted,
    'orgunit_link_orphans', v_op_orphans,
    'ita_flipped', v_ita_flipped,
    'unresolved_publication_type', v_unresolved_ptype,
    'unresolved_member_type', v_unresolved_mtype,
    'matview_dirty', v_matview_dirty
  );

  INSERT INTO ingest_runs (feed, generated_at_timestamp, generated_at_readable, applied_at, status, source_label, report)
  VALUES (v_feed, v_gen_ts, v_gen_readable, v_now, 'applied', v_source_label, v_report)
  ON CONFLICT (feed, generated_at_timestamp)
  DO UPDATE SET applied_at = EXCLUDED.applied_at, status = 'applied',
               source_label = EXCLUDED.source_label, report = EXCLUDED.report;

  RETURN v_report
    || jsonb_build_object('status', 'applied', 'feed', v_feed, 'generated_at_timestamp', v_gen_ts);
END;
$$;

COMMENT ON FUNCTION apply_publications_delta IS
  'Wendet ein normalisiertes Publications-Delta (jsonb) atomar an: Deletes (Person hart/geschützt, Pub soft-archive), Upserts per webdb_uid, Junction-Upsert/Delete per Composite-Key mit INNER-JOIN-FK-Auflösung, scoped is_ita-Recompute, Bestands-Backfills, Cursor. Werte werden vorab in TS normalisiert (DOI single-sourced). Ein SELECT-Aufruf ist all-or-nothing; Matview-Refresh macht der Aufrufer NACH Commit.';
