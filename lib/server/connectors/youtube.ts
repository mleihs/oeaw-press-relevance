// YouTube-Connector für Board-Smart-Objekte (BOARD_SMART_OBJECTS.md, P1).
//
// Zwei Betriebsarten, beide server-seitig ohne OAuth (nur öffentliche Videos):
//   1) YOUTUBE_API_KEY gesetzt → Data API v3 `videos.list` (1 Quota-Einheit,
//      Tageslimit 10.000): volle Metadaten inkl. Dauer/Views/publishedAt.
//   2) kein Key → oEmbed-Fallback (keyless): Titel/Kanal/Thumbnail, der Rest
//      bleibt null. So funktioniert URL-Paste out-of-the-box.
//
// Eigenkanal-Picker (YOUTUBE_CHANNEL_ID): quota-schonend über die Uploads-
// Playlist (Kanal-ID UC… → Playlist UU…, dokumentiertes API-Verhalten) via
// `playlistItems.list` (1 Einheit/Seite à 50) statt `search.list` (100
// Einheiten). Ergebnis 15 min im Prozess gecacht; Freitext filtert lokal.

import 'server-only';

import { getEnv } from '@/lib/server/env';
import { log } from '@/lib/server/log';
import type { YoutubePickerVideo, YoutubeSnapshot } from '@/lib/shared/board';

const API_BASE = 'https://www.googleapis.com/youtube/v3';
const FETCH_TIMEOUT_MS = 10_000;

/** 11 Zeichen aus dem Base64-URL-Alphabet — das Format jeder Video-ID. */
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
]);

/**
 * Video-ID aus einer YouTube-URL oder einer nackten ID. Unterstützt
 * watch?v=, youtu.be/, /shorts/, /embed/, /live/, /v/. null = nicht erkennbar.
 */
export function parseYoutubeVideoId(input: string): string | null {
  const raw = input.trim();
  if (VIDEO_ID_RE.test(raw)) return raw;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  let candidate: string | null = null;
  if (host === 'youtu.be') {
    candidate = u.pathname.split('/')[1] ?? null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    const seg = u.pathname.split('/').filter(Boolean);
    if (u.pathname === '/watch') candidate = u.searchParams.get('v');
    else if (seg.length >= 2 && ['shorts', 'embed', 'live', 'v'].includes(seg[0])) {
      candidate = seg[1];
    }
  }
  return candidate && VIDEO_ID_RE.test(candidate) ? candidate : null;
}

/** ISO-8601-Dauer (PT#H#M#S, optional P#DT…) -> Sekunden. null = unparsebar. */
export function parseIsoDuration(iso: string): number | null {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m || (!m[1] && !m[2] && !m[3] && !m[4])) return null;
  const [, d, h, min, s] = m;
  return (
    (Number(d) || 0) * 86400 + (Number(h) || 0) * 3600 + (Number(min) || 0) * 60 + (Number(s) || 0)
  );
}

/** Kanonische Video-URL (so landet sie in external_objects.url). */
export function youtubeVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function isYoutubeApiConfigured(): boolean {
  return Boolean(getEnv().YOUTUBE_API_KEY);
}

/** Eigenkanal-Picker braucht nur die (öffentliche) Kanal-ID: mit API-Key
 *  kommen bis zu 200 Uploads, ohne die 15 neuesten aus dem RSS-Feed. */
export function isChannelPickerConfigured(): boolean {
  return Boolean(getEnv().YOUTUBE_CHANNEL_ID);
}

async function fetchJson(url: string): Promise<unknown | null> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (err) {
    log.warn('youtube_fetch_error', {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
  if (!res.ok) {
    // 404/400 = Video existiert nicht (erwartbar); alles andere loggen.
    if (res.status !== 404 && res.status !== 400 && res.status !== 401) {
      log.warn('youtube_fetch_status', { status: res.status });
    }
    return null;
  }
  try {
    return await res.json();
  } catch {
    return null;
  }
}

interface ApiVideoItem {
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: Record<string, { url?: string }>;
  };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
}

/** Bestes verfügbares Thumbnail in Chip-Größe (medium 320px vor high/default). */
function pickThumbnail(thumbnails: Record<string, { url?: string }> | undefined): string | null {
  for (const size of ['medium', 'high', 'standard', 'default']) {
    const url = thumbnails?.[size]?.url;
    if (url) return url;
  }
  return null;
}

async function fetchVideoViaApi(videoId: string, apiKey: string): Promise<YoutubeSnapshot | null> {
  const url =
    `${API_BASE}/videos?part=snippet,contentDetails,statistics` +
    `&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`;
  const data = (await fetchJson(url)) as { items?: ApiVideoItem[] } | null;
  const item = data?.items?.[0];
  if (!item?.snippet?.title) return null;
  return {
    title: item.snippet.title,
    channel_title: item.snippet.channelTitle ?? null,
    published_at: item.snippet.publishedAt ?? null,
    duration_seconds: item.contentDetails?.duration
      ? parseIsoDuration(item.contentDetails.duration)
      : null,
    view_count: item.statistics?.viewCount != null ? Number(item.statistics.viewCount) : null,
    thumbnail_url: pickThumbnail(item.snippet.thumbnails),
  };
}

async function fetchVideoViaOEmbed(videoId: string): Promise<YoutubeSnapshot | null> {
  const url =
    'https://www.youtube.com/oembed?format=json&url=' +
    encodeURIComponent(youtubeVideoUrl(videoId));
  const data = (await fetchJson(url)) as {
    title?: string;
    author_name?: string;
    thumbnail_url?: string;
  } | null;
  if (!data?.title) return null;
  return {
    title: data.title,
    channel_title: data.author_name ?? null,
    published_at: null,
    duration_seconds: null,
    view_count: null,
    thumbnail_url: data.thumbnail_url ?? null,
  };
}

/**
 * Metadaten-Snapshot eines öffentlichen Videos. API v3 wenn konfiguriert,
 * sonst oEmbed. null = Video nicht auffindbar/privat/Netzfehler (Aufrufer
 * antwortet mit Validierungsfehler).
 */
export async function fetchYoutubeVideo(videoId: string): Promise<YoutubeSnapshot | null> {
  const apiKey = getEnv().YOUTUBE_API_KEY;
  if (apiKey) {
    const viaApi = await fetchVideoViaApi(videoId, apiKey);
    // Key ungültig/Quota erschöpft → oEmbed rettet zumindest Titel+Thumbnail.
    if (viaApi) return viaApi;
  }
  return fetchVideoViaOEmbed(videoId);
}

// --- Eigenkanal-Uploads (Picker) -------------------------------------------

/** Wire-Shape geteilt mit dem Client (lib/shared/board.ts). */
export type YoutubeChannelVideo = YoutubePickerVideo;

/** Uploads-Cache: die Playlist ändert sich selten (wenige Uploads/Woche);
 *  15 min TTL hält den Picker snappy und die Quota winzig. */
const UPLOADS_CACHE_TTL_MS = 15 * 60 * 1000;
const UPLOADS_MAX_PAGES = 4; // 4 × 50 = die 200 neuesten Videos
let uploadsCache: { fetchedAt: number; items: YoutubeChannelVideo[] } | null = null;

/** Test seam. */
export function resetYoutubeUploadsCache(): void {
  uploadsCache = null;
}

interface PlaylistItem {
  snippet?: { title?: string; thumbnails?: Record<string, { url?: string }> };
  contentDetails?: { videoId?: string; videoPublishedAt?: string };
}

/** Uploads via Data API (bis zu 200): Uploads-Playlist-ID = Kanal-ID mit
 *  UC→UU (dokumentiertes API-Verhalten, erspart channels.list). */
async function fetchUploadsViaApi(channelId: string, apiKey: string): Promise<YoutubeChannelVideo[]> {
  const playlistId = `UU${channelId.slice(2)}`;
  const items: YoutubeChannelVideo[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < UPLOADS_MAX_PAGES; page++) {
    const url =
      `${API_BASE}/playlistItems?part=snippet,contentDetails&maxResults=50` +
      `&playlistId=${encodeURIComponent(playlistId)}` +
      `&key=${encodeURIComponent(apiKey)}` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const data = (await fetchJson(url)) as {
      items?: PlaylistItem[];
      nextPageToken?: string;
    } | null;
    if (!data?.items) break;
    for (const it of data.items) {
      const videoId = it.contentDetails?.videoId;
      const title = it.snippet?.title;
      if (!videoId || !title) continue;
      items.push({
        video_id: videoId,
        title,
        published_at: it.contentDetails?.videoPublishedAt ?? null,
        thumbnail_url: pickThumbnail(it.snippet?.thumbnails),
      });
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return items;
}

/** Minimaler Entity-Decode für Feed-Titel (Atom escaped nur diese fünf). */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Keyless-Fallback: der öffentliche Atom-Feed des Kanals listet die 15
 * neuesten Uploads (ID/Titel/Datum/Thumbnail). Bewusst schmaler Regex-Parse
 * statt XML-Dependency — das Feed-Format ist stabil und flach.
 */
export function parseChannelFeed(xml: string): YoutubeChannelVideo[] {
  const items: YoutubeChannelVideo[] = [];
  for (const entry of xml.split('<entry>').slice(1)) {
    const videoId = /<yt:videoId>([\w-]{11})<\/yt:videoId>/.exec(entry)?.[1];
    const title = /<title>([\s\S]*?)<\/title>/.exec(entry)?.[1];
    if (!videoId || !title) continue;
    items.push({
      video_id: videoId,
      title: decodeXmlEntities(title.trim()),
      published_at: /<published>([^<]+)<\/published>/.exec(entry)?.[1] ?? null,
      thumbnail_url: /<media:thumbnail url="([^"]+)"/.exec(entry)?.[1] ?? null,
    });
  }
  return items;
}

async function fetchUploadsViaFeed(channelId: string): Promise<YoutubeChannelVideo[]> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (err) {
    log.warn('youtube_feed_error', {
      message: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
  if (!res.ok) return [];
  return parseChannelFeed(await res.text());
}

/**
 * Neueste Uploads des Eigenkanals (YOUTUBE_CHANNEL_ID), optional per Freitext
 * lokal gefiltert. Mit YOUTUBE_API_KEY bis zu 200 via Uploads-Playlist, ohne
 * die 15 neuesten via RSS-Feed. Leeres Array wenn nicht konfiguriert oder
 * Fetch-Fehler.
 */
export async function listOwnChannelVideos(query?: string): Promise<YoutubeChannelVideo[]> {
  const env = getEnv();
  if (!env.YOUTUBE_CHANNEL_ID) return [];

  if (!uploadsCache || Date.now() - uploadsCache.fetchedAt > UPLOADS_CACHE_TTL_MS) {
    const items = env.YOUTUBE_API_KEY
      ? await fetchUploadsViaApi(env.YOUTUBE_CHANNEL_ID, env.YOUTUBE_API_KEY)
      : await fetchUploadsViaFeed(env.YOUTUBE_CHANNEL_ID);
    // Fehlgeschlagenen Fetch (0 Items) nicht cachen — nächster Klick darf es
    // erneut versuchen.
    if (items.length === 0) return [];
    uploadsCache = { fetchedAt: Date.now(), items };
  }

  const q = query?.trim().toLowerCase();
  if (!q) return uploadsCache.items;
  return uploadsCache.items.filter((v) => v.title.toLowerCase().includes(q));
}
