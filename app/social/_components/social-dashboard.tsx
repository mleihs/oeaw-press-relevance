'use client';

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import type { SocialChannelWithPosts, SocialPost, SocialTheme } from '@/lib/shared/types';
import { postHaystack, matchesQuery, sortPosts, type SocialSort } from '@/lib/shared/social-filter';
import { StatusBanner } from '@/components/status-banner';
import { StatStrip } from './stat-strip';
import { SocialToolbar } from './social-toolbar';
import { SocialViews, type SocialView } from './social-views';
import type { DisclosureItem } from './accordion-list';
import type { PostCardChannel } from './post-card';

const compact = new Intl.NumberFormat('de-AT', { notation: 'compact', maximumFractionDigits: 1 });

export interface ThemeWithPosts {
  theme: SocialTheme;
  posts: SocialPost[];
}

function topKeywords(posts: SocialPost[], n = 4): string[] {
  const counts = new Map<string, number>();
  for (const p of posts) for (const k of p.keywords ?? []) {
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

export function SocialDashboard({
  themeItems,
  channels,
  channelById,
  windowDays,
  briefing,
}: {
  themeItems: ThemeWithPosts[];
  channels: SocialChannelWithPosts[];
  channelById: Record<string, PostCardChannel>;
  windowDays: number;
  briefing: ReactNode;
}) {
  const reduce = useReducedMotion();
  const viewsRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<SocialView>('themen');
  const [query, setQuery] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [sort, setSort] = useState<SocialSort>('recent');

  const allPosts = useMemo(() => channels.flatMap((c) => c.posts), [channels]);
  const selectedSet = useMemo(() => new Set(selectedChannels), [selectedChannels]);

  const pred = useCallback(
    (p: SocialPost) => {
      if (selectedSet.size && !selectedSet.has(p.channel_id)) return false;
      return matchesQuery(postHaystack(p, channelById[p.channel_id]?.handle), query);
    },
    [selectedSet, query, channelById],
  );

  const filtering = query.trim() !== '' || selectedChannels.length > 0;
  const resetKey = `${query}|${selectedChannels.join(',')}|${sort}`;

  const themeDisclosure = useMemo<DisclosureItem[]>(() => {
    // Key by the ORIGINAL snapshot index (stable across filtering) so surviving
    // themes keep their component identity — no remount, no lost child state.
    return themeItems
      .map((t, i) => ({ key: `theme-${i}`, theme: t.theme, posts: sortPosts(t.posts.filter(pred), sort) }))
      .filter((t) => !filtering || t.posts.length > 0)
      .map((t) => ({
        key: t.key,
        title: t.theme.theme,
        count: t.posts.length,
        meta: t.theme.channels.join(' · ') || undefined,
        description: t.theme.description || undefined,
        posts: t.posts,
      }));
  }, [themeItems, pred, sort, filtering]);

  const channelDisclosure = useMemo<DisclosureItem[]>(() => {
    return channels
      .map((c) => {
        const posts = sortPosts(c.posts.filter(pred), sort);
        const likes = posts.reduce((n, p) => n + (p.like_count ?? 0), 0);
        const last = posts.map((p) => p.posted_at).filter(Boolean).sort().at(-1) ?? null;
        const kw = topKeywords(posts);
        const meta = [
          likes > 0 ? `${compact.format(likes)} Likes` : null,
          last ? `vor ${formatDistanceToNow(new Date(last), { locale: de })}` : null,
        ].filter(Boolean).join(' · ');
        return {
          key: c.id,
          title: c.display_name || c.handle,
          count: posts.length,
          meta: meta || undefined,
          description: kw.length ? `Häufige Schlagworte: ${kw.join(', ')}` : undefined,
          posts,
        };
      })
      .filter((c) => !filtering || c.count > 0);
  }, [channels, pred, sort, filtering]);

  const resultCount = useMemo(() => allPosts.filter(pred).length, [allPosts, pred]);

  const channelOptions = useMemo(
    () => channels.map((c) => ({ value: c.id, label: c.handle })),
    [channels],
  );

  const goto = useCallback(
    (v: SocialView) => {
      setView(v);
      requestAnimationFrame(() =>
        viewsRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }),
      );
    },
    [reduce],
  );

  return (
    <div className="space-y-6">
      <StatStrip
        posts={allPosts.length}
        channels={channels.length}
        themes={themeItems.length}
        windowDays={windowDays}
        onThemen={() => goto('themen')}
        onKanaele={() => goto('kanaele')}
      />

      {briefing}

      {allPosts.length === 0 ? (
        <StatusBanner variant="neutral">
          Noch keine Posts geladen. Klicke oben auf „Aktualisieren", um Posts zu laden und das
          Lagebild zu erzeugen.
        </StatusBanner>
      ) : (
        <div ref={viewsRef} className="scroll-mt-4 space-y-4">
          <SocialToolbar
            query={query}
            onQuery={setQuery}
            channelOptions={channelOptions}
            selectedChannels={selectedChannels}
            onSelectedChannels={setSelectedChannels}
            sort={sort}
            onSort={setSort}
            resultCount={resultCount}
          />
          <SocialViews
            view={view}
            onView={setView}
            themeItems={themeDisclosure}
            channelItems={channelDisclosure}
            channelById={channelById}
            themeOpenMode={filtering ? 'all' : 'first'}
            channelOpenMode={filtering ? 'all' : 'none'}
            resetKey={resetKey}
          />
        </div>
      )}
    </div>
  );
}
