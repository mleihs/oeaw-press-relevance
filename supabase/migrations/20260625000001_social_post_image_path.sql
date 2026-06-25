-- Durable storage for social-post images. Instagram `displayUrl` values are
-- signed + short-lived, and some hosts (*.fna.fbcdn.net) only resolve inside
-- the origin ISP network, so proxying the live URL drops images (expiry or DNS
-- failure). We now download the bytes once into the PRIVATE `social-images`
-- Storage bucket and keep only the object key here — the bytes never touch
-- Postgres (500 MB project ceiling). NULL = not stored yet (or an unreachable
-- host); the serving route then falls back to the live proxy.
--
-- Object key: posts/<post-id>.jpg. Lifecycle + GC (reconcile-against-DB sweep)
-- live in lib/server/social/images.ts.
alter table social_posts add column if not exists image_path text;

comment on column social_posts.image_path is
  'Supabase Storage object key (bucket social-images, posts/<id>.jpg) of the durably stored image. NULL = not stored; serving falls back to the live IG proxy.';
