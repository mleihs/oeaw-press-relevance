-- Security-Audit M3: anon verliert den lesenden Vollzugriff.
--
-- 20260428000010_rls_lockdown.sql hatte `anon_select` (SELECT TO anon,
-- USING true) dynamisch auf JEDER damals RLS-aktiven public-Tabelle
-- angelegt; 20260710000001 kam mit `ingest_runs` dazu. Sensible Tabellen
-- wurden in 20260615000003 bereits entzogen (RLS ohne Policy) — hier
-- fällt der Rest: der App-Pfad läuft ausschließlich über Drizzle als
-- Tabellen-Owner (bypasst RLS), der Auth-Pfad über service_role/
-- authenticated-Policies. Der anon-Key kann danach keine Zeile mehr lesen.
--
-- Der Local-dev-Datenkopier-Workflow ("local dev DB from prod"), der
-- bisher über anon-REST las, wechselt auf den service_role-Key aus der
-- Env (lokal via `npx supabase status`, prod-seitig aus der Server-Env).
--
-- Idempotent: DROP POLICY IF EXISTS pro bekannter Tabelle, danach ein
-- Besenwagen-Loop für environment-spezifische Reste (die Policy wurde
-- seinerzeit dynamisch erzeugt — falls ein Environment eine Tabelle
-- mehr/weniger hat, räumt der Loop sie trotzdem ab).

DROP POLICY IF EXISTS anon_select ON public.extunit_persons;
DROP POLICY IF EXISTS anon_select ON public.extunits;
DROP POLICY IF EXISTS anon_select ON public.ingest_runs;
DROP POLICY IF EXISTS anon_select ON public.lecture_orgunits;
DROP POLICY IF EXISTS anon_select ON public.lecture_persons;
DROP POLICY IF EXISTS anon_select ON public.lecture_types;
DROP POLICY IF EXISTS anon_select ON public.lectures;
DROP POLICY IF EXISTS anon_select ON public.member_types;
DROP POLICY IF EXISTS anon_select ON public.oestat6_categories;
DROP POLICY IF EXISTS anon_select ON public.orgunit_persons;
DROP POLICY IF EXISTS anon_select ON public.orgunit_publications;
DROP POLICY IF EXISTS anon_select ON public.orgunit_types;
DROP POLICY IF EXISTS anon_select ON public.orgunits;
DROP POLICY IF EXISTS anon_select ON public.person_oestat6;
DROP POLICY IF EXISTS anon_select ON public.person_publications;
DROP POLICY IF EXISTS anon_select ON public.persons;
DROP POLICY IF EXISTS anon_select ON public.project_lectures;
DROP POLICY IF EXISTS anon_select ON public.projects;
DROP POLICY IF EXISTS anon_select ON public.publication_projects;
DROP POLICY IF EXISTS anon_select ON public.publication_types;
DROP POLICY IF EXISTS anon_select ON public.publications;

-- Besenwagen: was immer sonst noch `anon_select` heißt, fliegt mit.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND policyname = 'anon_select'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END$$;
