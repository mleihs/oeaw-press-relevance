'use client';

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import type { SocialChannelWithPosts, SocialPost, SocialTheme } from '@/lib/shared/types';
import { postHaystack, matchesQuery, sortPosts, isWithinDays, type SocialSort } from '@/lib/shared/social-filter';
import { StatusBanner } from '@/components/status-banner';
import { StatStrip } from './stat-strip';
import { SocialToolbar } from './social-toolbar';
import { SocialViews, type SocialView } from './social-views';
import type { GroupItem } from './group-section';
import type { PostCardChannel } from './post-card';
import { SocialFilterProvider } from './social-filter-context';
import { TopTags } from './top-tags';
import { ThemeChips } from './theme-chips';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { SearchX } from '@/lib/icons';
import { socialAccent, SOCIAL_ACCENTS } from './social-accents';
import { formatCompact } from '@/lib/shared/format-compact';


/** Anzahl „Top-Post"-Flame-Badges (Mock `hot`): die interaktionsstärksten
 *  Posts des Fensters. */
const HOT_COUNT = 2;

export interface ThemeWithPosts {
  theme: SocialTheme;
  posts: SocialPost[];
}

export function SocialDashboard({
  themeItems,
  channels,
  channelById,
  windowDays,
  freshWindowDays,
  briefing,
}: {
  themeItems: ThemeWithPosts[];
  channels: SocialChannelWithPosts[];
  channelById: Record<string, PostCardChannel>;
  windowDays: number;
  freshWindowDays: number;
  briefing: ReactNode;
}) {
  const reduce = useReducedMotion();
  const viewsRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<SocialView>('themen');
  const [query, setQuery] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sort, setSort] = useState<SocialSort>('recent');
  const [range, setRange] = useState<number | null>(null); // time-range quick-filter (days); null = Alle
  const [focusedThemeKey, setFocusedThemeKey] = useState<string | null>(null);
  const [focusNonce, setFocusNonce] = useState(0); // bumps so re-clicking the same theme re-opens it

  // Tags are a disjunctive (OR) facet: a post matches if it carries ANY active
  // tag. Toggle is case-insensitive; the displayed casing is preserved.
  const toggleTag = useCallback((tag: string) => {
    const lc = tag.toLowerCase();
    setSelectedTags((prev) =>
      prev.some((t) => t.toLowerCase() === lc) ? prev.filter((t) => t.toLowerCase() !== lc) : [...prev, tag],
    );
  }, []);
  const clearTags = useCallback(() => setSelectedTags([]), []);

  // One escape hatch that resets EVERY facet — shared by the toolbar's reset
  // button and the filtered-empty recovery action (filter-UX best practice:
  // a single Clear-All alongside per-chip removal).
  const clearAll = useCallback(() => {
    setQuery('');
    setSelectedChannels([]);
    setSelectedTags([]);
    setRange(null);
  }, []);

  const allPosts = useMemo(() => channels.flatMap((c) => c.posts), [channels]);
  const selectedSet = useMemo(() => new Set(selectedChannels), [selectedChannels]);
  const tagSet = useMemo(() => new Set(selectedTags.map((t) => t.toLowerCase())), [selectedTags]);

  // Kategoriale Kanal-Akzente (Mock): Index in der Kanal-Liste → Palette.
  // channelById kommt vom Server ohne Farbe; hier einmalig anreichern.
  const accentIndexByChannel = useMemo(() => {
    const m = new Map<string, number>();
    channels.forEach((c, i) => m.set(c.id, i % SOCIAL_ACCENTS.length));
    return m;
  }, [channels]);
  const channelByIdAccented = useMemo(() => {
    const out: Record<string, PostCardChannel> = {};
    for (const [id, ch] of Object.entries(channelById)) {
      out[id] = { ...ch, dot: socialAccent(accentIndexByChannel.get(id) ?? 0).dot };
    }
    return out;
  }, [channelById, accentIndexByChannel]);

  // „Top-Post"-Markierung: die interaktionsstärksten Posts des Fensters.
  const hotIds = useMemo(() => {
    const top = [...allPosts]
      .filter((p) => (p.like_count ?? 0) > 0)
      .sort((a, b) => (b.like_count ?? 0) - (a.like_count ?? 0))
      .slice(0, HOT_COUNT);
    return new Set(top.map((p) => p.id));
  }, [allPosts]);

  const totalLikes = useMemo(
    () => allPosts.reduce((n, p) => n + (p.like_count ?? 0), 0),
    [allPosts],
  );

  const pred = useCallback(
    (p: SocialPost) => {
      if (selectedSet.size && !selectedSet.has(p.channel_id)) return false;
      if (tagSet.size && !(p.keywords ?? []).some((k) => tagSet.has(k.toLowerCase()))) return false;
      if (range !== null && !isWithinDays(p.posted_at, range)) return false;
      return matchesQuery(postHaystack(p, channelById[p.channel_id]?.handle), query);
    },
    [selectedSet, tagSet, range, query, channelById],
  );

  const filtering =
    query.trim() !== '' || selectedChannels.length > 0 || selectedTags.length > 0 || range !== null;

  // Human-readable echo of what's currently narrowing the feed — shown inside
  // the empty state so "no results" is never a dead-end (the user sees WHY and
  // can recover). Channel ids → handles via channelById.
  const activeFilterSummary = useMemo(() => {
    const parts: string[] = [];
    if (query.trim()) parts.push(`Suche „${query.trim()}“`);
    for (const id of selectedChannels) parts.push(`@${channelById[id]?.handle ?? id}`);
    for (const t of selectedTags) parts.push(`#${t}`);
    if (range !== null) parts.push(`letzte ${range} Tage`);
    return parts;
  }, [query, selectedChannels, selectedTags, range, channelById]);

  // Recovery empty state (filter-UX best practice: name the active filters +
  // offer a one-click reset). Rendered only while filtering — a genuinely empty
  // lens (e.g. no snapshot yet) keeps the group list's own neutral message.
  const filteredEmpty = (
    <EmptyState
      icon={<SearchX className="h-5 w-5" />}
      title="Keine Posts für die aktuellen Filter"
      body={
        activeFilterSummary.length > 0 ? (
          <>
            Aktiv: {activeFilterSummary.join(' · ')}. Lockere einen Filter oder setze alle zurück.
          </>
        ) : (
          'Passe Suche oder Filter an.'
        )
      }
      action={
        <Button variant="outline" size="sm" onClick={clearAll}>
          Alle Filter zurücksetzen
        </Button>
      }
      className="border-[1.5px] border-dashed border-line-strong bg-transparent"
    />
  );

  const themeGroups = useMemo<GroupItem[]>(() => {
    // Key by the ORIGINAL snapshot index (stable across filtering) so surviving
    // themes keep their component identity — no remount, no lost child state.
    return themeItems
      .map((t, i) => ({ i, theme: t.theme, posts: sortPosts(t.posts.filter(pred), sort) }))
      .filter((t) => !filtering || t.posts.length > 0)
      .map((t) => ({
        key: `theme-${t.i}`,
        title: t.theme.theme,
        description: t.theme.description || undefined,
        metaMono: t.theme.channels.map((c) => `@${c}`).join(' · ') || undefined,
        count: t.posts.length,
        accentIndex: t.i,
        badge: 'count' as const,
        posts: t.posts,
      }));
  }, [themeItems, pred, sort, filtering]);

  const channelGroups = useMemo<GroupItem[]>(() => {
    return channels
      .map((c, i) => {
        const posts = sortPosts(c.posts.filter(pred), sort);
        const likes = posts.reduce((n, p) => n + (p.like_count ?? 0), 0);
        const last = posts.map((p) => p.posted_at).filter(Boolean).sort().at(-1) ?? null;
        const meta = [
          `${posts.length} Posts`,
          likes > 0 ? `${formatCompact(likes)} Likes` : null,
          last ? `zuletzt vor ${formatDistanceToNow(new Date(last), { locale: de })}` : null,
        ].filter(Boolean).join(' · ');
        return {
          key: c.id,
          title: `@${c.handle}`,
          description: c.display_name || undefined,
          metaMono: meta,
          count: posts.length,
          accentIndex: i % SOCIAL_ACCENTS.length,
          badge: 'avatar' as const,
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

  // Theme fields (stable keys match themeGroups) for the clickable chip row.
  const themeChips = useMemo(
    () =>
      themeItems.map((t, i) => ({
        key: `theme-${i}`,
        title: t.theme.theme,
        count: t.posts.length,
        accentIndex: i,
      })),
    [themeItems],
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

  // Theme chip → switch to the Themen view + scroll that theme into view.
  const gotoTheme = useCallback((key: string) => {
    setView('themen');
    setFocusedThemeKey(key);
    setFocusNonce((n) => n + 1);
  }, []);

  return (
    <div className="space-y-6">
      <StatStrip
        posts={allPosts.length}
        channels={channels.length}
        themes={themeItems.length}
        likes={totalLikes}
        windowDays={windowDays}
        onThemen={() => goto('themen')}
        onKanaele={() => goto('kanaele')}
      />

      {briefing}

      {allPosts.length > 0 && (
        <ThemeChips themes={themeChips} activeKey={focusedThemeKey} onSelect={gotoTheme} />
      )}

      {allPosts.length === 0 ? (
        <StatusBanner variant="neutral">
          Noch keine Posts geladen. Klicke oben auf „Aktualisieren", um Posts zu laden und das
          Lagebild zu erzeugen.
        </StatusBanner>
      ) : (
        <SocialFilterProvider value={{ activeTags: selectedTags, toggleTag, clearTags }}>
          <div ref={viewsRef} className="scroll-mt-4 space-y-4">
            <SocialToolbar
              view={view}
              onView={setView}
              query={query}
              onQuery={setQuery}
              channelOptions={channelOptions}
              selectedChannels={selectedChannels}
              onSelectedChannels={setSelectedChannels}
              sort={sort}
              onSort={setSort}
              range={range}
              onRange={setRange}
              resultCount={resultCount}
              onClearAll={clearAll}
            />
            <TopTags posts={allPosts} />
            <SocialViews
              view={view}
              themeItems={themeGroups}
              channelItems={channelGroups}
              channelById={channelByIdAccented}
              hotIds={hotIds}
              freshWindowDays={freshWindowDays}
              splitOlder={!filtering}
              themeFocusKey={focusedThemeKey ? `${focusedThemeKey}#${focusNonce}` : ''}
              emptyState={filtering ? filteredEmpty : undefined}
            />
          </div>
        </SocialFilterProvider>
      )}
    </div>
  );
}
