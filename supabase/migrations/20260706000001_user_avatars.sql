-- Profilbilder (aus MeisterTask übernommen): S3/MinIO-Objektschlüssel je User.
-- Ausgeliefert über den auth-gated Proxy /api/users/[id]/avatar — die Spalte
-- hält nur den Storage-Key (z.B. 'avatars/<user_id>.jpg'), keine URL.
alter table public.users
  add column if not exists avatar_key text;
