// Pure client-side filter/sort helpers for the social section. Small dataset
// (posts already loaded for the window) → instant, in-memory filtering. Kept
// pure + unit-tested so the dashboard island just wires state to these.

import type { SocialPost } from './types';

export type SocialSort = 'recent' | 'engaged';

/** Lowercased searchable text for a post (+ optional channel handle). */
export function postHaystack(post: SocialPost, channelHandle?: string): string {
  return [
    post.topic,
    post.summary_de,
    post.caption,
    (post.keywords ?? []).join(' '),
    channelHandle,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** AND-match: every whitespace-separated term must appear in the haystack. */
export function matchesQuery(haystack: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return q.split(/\s+/).every((term) => haystack.includes(term));
}

/** Is a post within the last `days`? Undated posts count as recent (kept).
 *  Used for the fresh-window split and the time-range quick-filter. */
export function isWithinDays(postedAt: string | null, days: number): boolean {
  if (!postedAt) return true;
  return new Date(postedAt).getTime() >= Date.now() - days * 24 * 60 * 60 * 1000;
}

export function sortPosts(posts: SocialPost[], sort: SocialSort): SocialPost[] {
  const arr = [...posts];
  if (sort === 'engaged') {
    arr.sort(
      (a, b) =>
        (b.like_count ?? 0) + (b.comment_count ?? 0) -
        ((a.like_count ?? 0) + (a.comment_count ?? 0)),
    );
  } else {
    arr.sort((a, b) => (b.posted_at ?? '').localeCompare(a.posted_at ?? ''));
  }
  return arr;
}
