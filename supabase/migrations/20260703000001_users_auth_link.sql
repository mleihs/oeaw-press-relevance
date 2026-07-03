-- Phase 1 Redaktionsboard (BOARD_PLAN.md §3.1/§5): den users-Stub aus
-- 20260429000004 an Supabase Auth koppeln. Identität lebt in auth.users
-- (E-Mail+Passwort, admin-seitig angelegt); public.users spiegelt sie 1:1
-- und trägt App-Daten (display_name, role, disabled_at).
--
-- Rollenmodell: admin | member (ersetzt das nie benutzte editor|viewer —
-- Writer-Analyse 2026-07-03: kein Code schreibt in users, Tabelle leer in
-- local UND prod, daher gefahrlos änderbar; Guard unten erzwingt das).
--
-- Nutzer werden deaktiviert, nie gelöscht (disabled_at): Kommentar-/
-- Aktivitäts-Autorschaft (Phase 2+) muss Personalwechsel überleben. Die
-- Phase-2-Autoren-FKs zeigen mit ON DELETE RESTRICT auf users — damit
-- kann ein Nutzer MIT Inhalten nie gelöscht werden (Postgres erzwingt es),
-- ein fehlangelegter Account OHNE Inhalte aber schon (CASCADE von
-- auth.users her räumt dann beide Zeilen).

-- Guard: der Umbau setzt leere Tabellen voraus (kein Daten-Migrationspfad).
do $$
begin
  if exists (select 1 from public.users) then
    raise exception 'users ist nicht leer — Migration braucht einen Daten-Migrationspfad';
  end if;
end $$;

-- id kommt fortan aus auth.users, nie mehr aus gen_random_uuid().
alter table public.users alter column id drop default;
alter table public.users
  add constraint users_id_fkey
  foreign key (id) references auth.users(id) on delete cascade;

alter table public.users drop constraint users_role_check;
alter table public.users alter column role set default 'member';
alter table public.users
  add constraint users_role_check check (role in ('admin', 'member'));

alter table public.users add column disabled_at timestamptz;

-- Spiegel-Trigger: jeder neue auth-Account bekommt automatisch seine
-- public.users-Zeile. Rolle kommt, falls vorhanden, aus raw_app_meta_data
-- (nur per service-role setzbar — raw_user_meta_data kann der Nutzer
-- selbst über die Auth-API ändern und ist deshalb für role tabu),
-- display_name aus raw_user_meta_data (unkritisch). ACHTUNG: GoTrue merged
-- custom app_metadata erst NACH dem INSERT — beim Admin-API-Anlegen greift
-- hier also der member-Default, und createAdminUser (lib/server/auth/
-- admin.ts) setzt die Rolle anschließend explizit. public.users.role ist
-- nach dem Anlegen die alleinige Source of Truth.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := new.raw_app_meta_data ->> 'role';
begin
  if v_role is null or v_role not in ('admin', 'member') then
    v_role := 'member';
  end if;
  insert into public.users (id, email, display_name, role)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    v_role
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- E-Mail-Änderungen (Admin-API) mitziehen, damit public.users.email nie
-- von der Login-Identität abweicht.
create or replace function public.handle_auth_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_auth_user_email_change();

-- RLS: eingeloggte Teammitglieder dürfen alle Nutzer lesen (Namen/Avatare
-- im Board, Phase 2; Voraussetzung für Realtime, Plan §3.2). Schreiben
-- läuft ausschließlich über service-role (Admin-Routen); anon sieht nichts.
-- user_settings bleibt policy-frei (weiter service-role-only).
create policy authenticated_select on public.users
  for select to authenticated using (true);

comment on table public.users is
  'App-Spiegel von auth.users (Trigger on_auth_user_created). role: admin|member; '
  'deaktivieren statt löschen via disabled_at (BOARD_PLAN.md §3.1).';
