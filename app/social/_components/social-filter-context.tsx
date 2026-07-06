'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { cn } from '@/lib/shared/utils';

/**
 * Cross-cutting tag-filter state for the social section. Tags are clicked from
 * many places (post cards, the "Häufige Tags" row, the toolbar chips), so a
 * context avoids prop-drilling the toggle through SocialViews/AccordionList.
 * Channel/query/sort stay toolbar-local props; only tags need this.
 *
 * Outside a provider (toggleTag undefined) TagChip renders as a static badge,
 * so PostCard stays usable anywhere.
 */
interface SocialFilterValue {
  activeTags: string[];
  toggleTag?: (tag: string) => void;
  clearTags?: () => void;
}

const SocialFilterContext = createContext<SocialFilterValue>({ activeTags: [] });

export function SocialFilterProvider({
  value,
  children,
}: {
  value: SocialFilterValue;
  children: ReactNode;
}) {
  return <SocialFilterContext.Provider value={value}>{children}</SocialFilterContext.Provider>;
}

export function useSocialFilter(): SocialFilterValue {
  return useContext(SocialFilterContext);
}

/** A keyword chip. Clickable (toggles the tag filter) when a provider is
 *  present; a plain badge otherwise. Stops propagation so clicking a tag inside
 *  a card / accordion header never triggers the parent. */
export function TagChip({ tag, className }: { tag: string; className?: string }) {
  const { activeTags, toggleTag } = useSocialFilter();
  const active = activeTags.some((t) => t.toLowerCase() === tag.toLowerCase());

  // Mock Toolkit-Redesign: Keyword-Chips als blaue #-Pills auf brand-Tint.
  const chip = cn(
    'rounded-full px-2 py-0.5 text-2xs font-medium transition-colors',
    active ? 'bg-brand-500 text-white' : 'bg-brand-500/10 text-brand-700 dark:text-brand-300',
    className,
  );

  if (!toggleTag) {
    return <span className={chip}>#{tag}</span>;
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation();
        toggleTag(tag);
      }}
      className={cn(
        chip,
        'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        !active && 'hover:bg-brand-500/20',
      )}
    >
      #{tag}
    </button>
  );
}
