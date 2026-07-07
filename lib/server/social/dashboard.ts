// Kompaktes Lagebild fürs Dashboard (Design Toolkit-Redesign §Dashboard,
// „Social-Media-Trends"-Karte): Top-Themen des letzten Snapshots mit
// Post-/Like-Summen, Aktivitäts-Sparkline und Momentum, dazu der stärkste
// Post im Fenster. Reine SELECTs über die bestehenden Read-Helfer — kein
// Apify-/LLM-Aufruf, der Dashboard-Besuch kostet nichts.

import 'server-only';
import { unstable_cache } from 'next/cache';
import { getEnv } from '@/lib/server/env';
import {
  getLatestThemeSnapshot,
  getPostsByIds,
  listChannelsWithRecentPosts,
} from './list';
import { resolveThemePosts } from './resolve';
import type { SocialPost } from '@/lib/shared/types';

export interface SocialDashboardTheme {
  name: string;
  /** Index des Themas in der Snapshot-Reihenfolge — /social vergibt seine
   *  kategorialen Akzentfarben per Index, so bleiben die Farben konsistent. */
  accent_index: number;
  post_count: number;
  likes: number;
  /** Momentum in % (Likes jüngere vs. ältere Fensterhälfte); null wenn die
   *  ältere Hälfte leer ist (kein sinnvoller Bezugswert). */
  delta_pct: number | null;
  /** Aktivität über das Fenster: Posts je Sechstel, alt → neu. */
  spark: number[];
}

export interface SocialDashboardTopPost {
  topic: string;
  handle: string;
  likes: number;
  comments: number;
  accent_index: number;
}

export interface SocialDashboardData {
  window_days: number;
  channel_count: number;
  /** Gesamt-Momentum in % über alle Posts im Fenster (null ohne Bezugswert). */
  delta_pct: number | null;
  themes: SocialDashboardTheme[];
  top_post: SocialDashboardTopPost | null;
}

const SPARK_BUCKETS = 6;

function likesOf(posts: SocialPost[]): number {
  return posts.reduce((n, p) => n + (p.like_count ?? 0), 0);
}

/** Momentum: Likes der jüngeren Fensterhälfte gegen die ältere, in Prozent. */
function momentumPct(posts: SocialPost[], windowStart: number, windowMs: number): number | null {
  const mid = windowStart + windowMs / 2;
  let older = 0;
  let newer = 0;
  for (const p of posts) {
    if (!p.posted_at) continue;
    const t = new Date(p.posted_at).getTime();
    if (t < mid) older += p.like_count ?? 0;
    else newer += p.like_count ?? 0;
  }
  if (older <= 0) return null;
  return Math.round(((newer - older) / older) * 100);
}

function sparkline(posts: SocialPost[], windowStart: number, windowMs: number): number[] {
  const buckets = new Array<number>(SPARK_BUCKETS).fill(0);
  for (const p of posts) {
    if (!p.posted_at) continue;
    const t = new Date(p.posted_at).getTime();
    const i = Math.min(
      SPARK_BUCKETS - 1,
      Math.max(0, Math.floor(((t - windowStart) / windowMs) * SPARK_BUCKETS)),
    );
    buckets[i]++;
  }
  return buckets;
}

/** null, wenn es noch keinen Themen-Snapshot oder keine Posts gibt — die
 *  Dashboard-Karte blendet sich dann aus. Param-unabhängig und nur durch
 *  einen Social-Refresh veränderlich → 60 s gecacht (Muster wie die
 *  Aggregat-Reader in lib/server/dashboard/fetch.ts); ohne Cache liefe die
 *  Kanal+Posts-Abfrage bei jedem Dashboard-Hit, auch anonym auf `/`. */
export const getSocialDashboardData = unstable_cache(
  computeSocialDashboardData,
  ['dashboard-social'],
  { revalidate: 60 },
);

async function computeSocialDashboardData(): Promise<SocialDashboardData | null> {
  const env = getEnv();
  const snapshot = await getLatestThemeSnapshot();
  if (!snapshot) return null;
  const windowDays = snapshot.window_days || env.SOCIAL_WINDOW_DAYS;
  // Fenster am Snapshot verankern, nicht an now(): liegt der letzte Refresh
  // länger zurück, fielen sonst ALLE Posts in die älteste Hälfte (Momentum
  // pauschal −100 %, Sparkline nur ein Balken).
  const windowEnd = new Date(snapshot.created_at).getTime() || Date.now();
  // Pool im Fenster des SNAPSHOTS laden — Tage UND Anker. Mit now-relativem
  // Anker rutschen mit jedem Tag seit dem letzten Refresh Posts aus der
  // älteren Fensterhälfte aus dem Pool: der Momentum-Nenner schrumpft und
  // der Wert bläht sich auf (beobachtet: −10 % → +133 % über Nacht, ohne
  // neue Daten — sah aus wie ein Caching-Fehler, war aber Drift).
  const channels = await listChannelsWithRecentPosts(windowDays, windowEnd);

  const allPosts = channels.flatMap((c) => c.posts);
  // Wie auf /social: Snapshot-referenzierte Posts außerhalb der Kanal-Kappung
  // nachladen, damit Themen-Summen nicht künstlich klein ausfallen.
  const have = new Set(allPosts.map((p) => p.id));
  const missing = [...new Set(snapshot.themes.flatMap((t) => t.post_ids ?? []))].filter(
    (id) => !have.has(id),
  );
  const pool = missing.length ? [...allPosts, ...(await getPostsByIds(missing))] : allPosts;
  if (pool.length === 0) return null;

  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const windowStart = windowEnd - windowMs;

  const themeItems = resolveThemePosts(snapshot.themes, pool);
  const themes = themeItems
    .map((item, i) => ({
      name: item.theme.theme,
      accent_index: i,
      post_count: item.posts.length,
      likes: likesOf(item.posts),
      delta_pct: momentumPct(item.posts, windowStart, windowMs),
      spark: sparkline(item.posts, windowStart, windowMs),
    }))
    .filter((t) => t.post_count > 0)
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 3);

  const channelById = new Map(channels.map((c) => [c.id, c]));
  const top = [...pool].sort((a, b) => (b.like_count ?? 0) - (a.like_count ?? 0))[0];
  const topChannelIdx = channels.findIndex((c) => c.id === top?.channel_id);
  const topChannel = top ? channelById.get(top.channel_id) : undefined;

  return {
    window_days: windowDays,
    channel_count: channels.length,
    delta_pct: momentumPct(pool, windowStart, windowMs),
    themes,
    top_post: top
      ? {
          topic:
            top.topic?.trim() ||
            top.caption?.trim().slice(0, 80) ||
            'Beliebtester Beitrag',
          handle: `@${topChannel?.handle ?? 'oeaw'}`,
          likes: top.like_count ?? 0,
          comments: top.comment_count ?? 0,
          accent_index: Math.max(0, topChannelIdx),
        }
      : null,
  };
}
