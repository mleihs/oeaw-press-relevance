// Map each theme to its member posts. Primary signal: the `post_ids` the LLM
// assigned during snapshot generation. Fallback (for snapshots created before
// post_ids shipped, or when the LLM omitted them): match posts whose topic or
// keywords overlap the theme's keywords. Pure + unit-tested (resolve.test.ts).

import 'server-only';
import type { SocialPost, SocialTheme } from '@/lib/shared/types';

export interface ThemeWithPosts {
  theme: SocialTheme;
  posts: SocialPost[];
}

export function resolveThemePosts(
  themes: SocialTheme[],
  posts: SocialPost[],
): ThemeWithPosts[] {
  const byId = new Map(posts.map((p) => [p.id, p]));

  return themes.map((theme) => {
    // Primary: explicit post_ids from the LLM.
    const fromIds = (theme.post_ids ?? [])
      .map((id) => byId.get(id))
      .filter((p): p is SocialPost => p !== undefined);
    if (fromIds.length > 0) return { theme, posts: fromIds };

    // Fallback: keyword / topic overlap.
    const needles = theme.keywords
      .map((k) => k.toLowerCase().trim())
      .filter(Boolean);
    if (needles.length === 0) return { theme, posts: [] };

    const matched = posts.filter((p) => {
      const hay = `${p.topic ?? ''} ${(p.keywords ?? []).join(' ')}`.toLowerCase();
      return needles.some((n) => hay.includes(n));
    });
    return { theme, posts: matched };
  });
}
