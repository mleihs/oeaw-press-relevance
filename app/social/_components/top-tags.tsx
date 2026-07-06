'use client';

import { useMemo } from 'react';
import { Hash } from '@/lib/icons';
import type { SocialPost } from '@/lib/shared/types';
import { cn } from '@/lib/shared/utils';
import { useSocialFilter } from './social-filter-context';

/** Discovery row (Mock: „Häufige Tags" als Outline-Pills mit #-Icon + Zähler).
 *  Die häufigsten Schlagworte des Fensters als klickbare Filter-Chips —
 *  Frequenz über alle Posts, damit die Zeile stabil bleibt. */
export function TopTags({ posts, limit = 12 }: { posts: SocialPost[]; limit?: number }) {
  const { activeTags, toggleTag } = useSocialFilter();
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
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[.05em] text-ink-soft">
        Häufige Tags
      </span>
      {tags.map((t) => {
        const active = activeTags.some((a) => a.toLowerCase() === t.label.toLowerCase());
        return (
          <button
            key={t.label}
            type="button"
            aria-pressed={active}
            onClick={() => toggleTag?.(t.label)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'border-brand-500/60 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                : 'border-line bg-surface text-ink-subtle hover:border-line-strong hover:text-foreground',
            )}
          >
            <Hash className={cn('h-3 w-3', active ? '' : 'text-ink-soft')} aria-hidden />
            {t.label}
            <span className="font-mono text-[10px] text-ink-soft">{t.n}</span>
          </button>
        );
      })}
    </div>
  );
}
