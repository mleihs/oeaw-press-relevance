// Durable image storage for social posts.
//
// Instagram `displayUrl`s are signed + short-lived, and some resolve only
// inside the origin ISP network (*.fna.fbcdn.net → DNS "could not resolve host"
// from our servers). Storing the URL and proxying it live is therefore fragile:
// the image vanishes on expiry or unreachable host. Instead we download the
// bytes ONCE at refresh time into a PRIVATE Supabase Storage bucket and serve
// from there.
//
//   Bucket: `social-images` (private)        Key: posts/<post-id>.jpg
//
// The bytes never touch Postgres (500 MB project ceiling); the row keeps only
// `image_path`. Invariant: an object exists IFF some row carries that
// image_path — enforced by reconcilePostImages(), the single authoritative GC,
// which handles retention-prune, channel-cascade delete, and drift uniformly
// from DB truth. Everything here is non-fatal: image trouble must never break a
// refresh.

import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db, socialPosts } from '@/lib/server/db';
import { getSupabaseAdmin } from '@/lib/server/db/supabase';
import { log } from '@/lib/server/log';

export const SOCIAL_IMAGE_BUCKET = 'social-images';
const IMAGE_PREFIX = 'posts';
const FETCH_CONCURRENCY = 5;
const FETCH_TIMEOUT_MS = 15_000;

/** Storage object key for a post — deterministic + 1:1 with the row id. */
export function imageKeyForPost(postId: string): string {
  return `${IMAGE_PREFIX}/${postId}.jpg`;
}

// IG CDN hosts a `displayUrl` may point at. Constrain server-side fetches to
// these so a poisoned displayUrl can't turn the fetch into an SSRF vector.
const ALLOWED_IMAGE_HOST = /(?:^|\.)(?:cdninstagram\.com|fbcdn\.net)$/i;
export function isAllowedImageUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  return u.protocol === 'https:' && ALLOWED_IMAGE_HOST.test(u.hostname);
}

export interface RemoteImage {
  bytes: ArrayBuffer;
  contentType: string;
}

/**
 * Fetch image bytes from an allow-listed IG CDN URL. Returns null on ANY
 * failure (host not allowed, *.fna.fbcdn.net DNS-unresolvable, timeout, non-2xx,
 * non-image body) — the caller then leaves the post unstored and falls back.
 */
export async function fetchRemoteImage(url: string): Promise<RemoteImage | null> {
  if (!isAllowedImageUrl(url)) return null;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StoryScout/1.0)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  if (!contentType.startsWith('image/')) return null;
  try {
    return { bytes: await res.arrayBuffer(), contentType };
  } catch {
    return null;
  }
}

/** Keys present in storage that no live row references — the GC delete set. */
export function selectOrphanKeys(listed: string[], validKeys: Set<string>): string[] {
  return listed.filter((k) => !validKeys.has(k));
}

let bucketEnsured: Promise<void> | null = null;
type Admin = ReturnType<typeof getSupabaseAdmin>;

/** Create the private bucket if missing (idempotent, once per process). */
function ensureBucket(supa: Admin): Promise<void> {
  if (!bucketEnsured) {
    bucketEnsured = (async () => {
      const { data, error } = await supa.storage.listBuckets();
      if (error) throw error;
      if (data?.some((b) => b.name === SOCIAL_IMAGE_BUCKET)) return;
      const { error: createErr } = await supa.storage.createBucket(SOCIAL_IMAGE_BUCKET, {
        public: false,
      });
      // Tolerate a concurrent create (another process won the race).
      if (createErr && !/already exists/i.test(createErr.message)) throw createErr;
    })().catch((e) => {
      bucketEnsured = null; // allow a retry on the next call
      throw e;
    });
  }
  return bucketEnsured;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      out[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 0 }, worker));
  return out;
}

export interface ImageSyncResult {
  stored: number;
  failed: number;
  removed: number;
}

/**
 * Persist bytes for every post that has an `image_url` but no stored object,
 * then reconcile the bucket against DB truth (delete orphans). Fully
 * non-fatal: each failure is logged and swallowed. Returns run counts.
 */
export async function persistAndReconcilePostImages(): Promise<ImageSyncResult> {
  const result: ImageSyncResult = { stored: 0, failed: 0, removed: 0 };

  let supa: Admin;
  try {
    supa = getSupabaseAdmin();
    await ensureBucket(supa);
  } catch (err) {
    // No storage configured/reachable → leave everything on the live-proxy
    // fallback. Never fail the refresh for this.
    log.error('social_image_storage_unavailable', {
      message: err instanceof Error ? err.message : String(err),
    });
    return result;
  }

  // 1) Store unstored, reachable images.
  const unstored = await db
    .select({ id: socialPosts.id, imageUrl: socialPosts.imageUrl })
    .from(socialPosts)
    .where(and(isNotNull(socialPosts.imageUrl), isNull(socialPosts.imagePath)));

  const outcomes = await mapPool(unstored, FETCH_CONCURRENCY, async (row) => {
    if (!row.imageUrl) return false;
    const img = await fetchRemoteImage(row.imageUrl);
    if (!img) return false; // FNA / expired / unreachable → stays unstored
    const key = imageKeyForPost(row.id);
    const { error } = await supa.storage
      .from(SOCIAL_IMAGE_BUCKET)
      .upload(key, img.bytes, { contentType: img.contentType, upsert: true });
    if (error) {
      log.error('social_image_upload_error', { id: row.id, message: error.message });
      return false;
    }
    // Set image_path only AFTER a successful upload, so the invariant (object
    // exists ⇒ row references it) holds even if this crashes mid-batch.
    await db.update(socialPosts).set({ imagePath: key }).where(eq(socialPosts.id, row.id));
    return true;
  });
  for (const ok of outcomes) {
    if (ok) result.stored++;
    else result.failed++;
  }

  // 2) Reconcile: remove storage objects no live row references.
  try {
    result.removed = await reconcilePostImages(supa);
  } catch (err) {
    log.error('social_image_reconcile_error', {
      message: err instanceof Error ? err.message : String(err),
    });
  }
  return result;
}

/** GC sweep: delete every stored object not referenced by a row's image_path. */
async function reconcilePostImages(supa: Admin): Promise<number> {
  const rows = await db
    .select({ imagePath: socialPosts.imagePath })
    .from(socialPosts)
    .where(isNotNull(socialPosts.imagePath));
  const valid = new Set(rows.map((r) => r.imagePath).filter((p): p is string => Boolean(p)));

  const orphans = selectOrphanKeys(await listAllKeys(supa), valid);
  if (orphans.length === 0) return 0;

  let removed = 0;
  for (let i = 0; i < orphans.length; i += 100) {
    const chunk = orphans.slice(i, i + 100);
    const { error } = await supa.storage.from(SOCIAL_IMAGE_BUCKET).remove(chunk);
    if (error) {
      log.error('social_image_remove_error', { message: error.message });
      break;
    }
    removed += chunk.length;
  }
  return removed;
}

/** Every object key under the posts/ prefix (paginated). */
async function listAllKeys(supa: Admin): Promise<string[]> {
  const keys: string[] = [];
  const pageSize = 100;
  let offset = 0;
  for (;;) {
    const { data, error } = await supa.storage
      .from(SOCIAL_IMAGE_BUCKET)
      .list(IMAGE_PREFIX, { limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const obj of data) keys.push(`${IMAGE_PREFIX}/${obj.name}`);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return keys;
}
