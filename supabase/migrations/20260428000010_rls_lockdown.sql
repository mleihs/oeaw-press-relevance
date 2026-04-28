-- B1: RLS lockdown. The previous "Allow all access" policies meant the anon
-- role could INSERT/UPDATE/DELETE every table — combined with a public anon
-- key, this was a catastrophic data-loss vector.
--
-- New policy: anon = SELECT-only on every RLS-enabled public table.
-- The service role (used by Next API routes for mutations) automatically
-- bypasses RLS, so privileged server code keeps full access.

DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop the legacy wide-open policies wherever they exist
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND policyname = 'Allow all access'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END$$;

-- Anon read-only policy on every RLS-enabled table in the public schema
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
  LOOP
    EXECUTE format(
      'CREATE POLICY "anon_select" ON public.%I FOR SELECT TO anon USING (true)',
      t
    );
  END LOOP;
END$$;
