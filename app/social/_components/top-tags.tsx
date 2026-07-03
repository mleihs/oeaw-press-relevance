'use client';

import { useMemo } from 'react';
import { Tags } from '@/lib/icons';
import type { SocialPost } from '@/lib/shared/types';
import { TagChip } from './social-filter-context';

/** Discovery row: the most frequent keywords across the loaded window, as
 *  clickable chips. A clean chip row (not a font-size tag cloud — NN/g cautions
 *  those hurt usability). Frequency over all posts so it's a stable surface. */
export function TopTags({ posts, limit = 14 }: { posts: SocialPost[]; limit?: number }) {
  const tags = useMemo(() => {
    const counts = new Map<string, { label: string; n: number }>();
    for (const p of posts) {
      for (const k of p.keywords ?? []) {
        const key = k.toLowerCase();
        const cur = counts.get(key);
        if (cur) cur.n += 1;
        else counts.set(key, { label: k, n: 1 });
      }
    }
    return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, limit);
  }, [posts, limit]);

  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Tags className="h-3.5 w-3.5" aria-hidden />
        Häufige Tags:
      </span>
      {tags.map((t) => (
        <TagChip key={t.label} tag={t.label} />
      ))}
    </div>
  );
}
