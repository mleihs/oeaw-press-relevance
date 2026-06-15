'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
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

  if (!toggleTag) {
    return (
      <Badge variant="secondary" className={cn('text-[10px] font-normal', className)}>
        {tag}
      </Badge>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation();
        toggleTag(tag);
      }}
      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Badge
        variant={active ? 'default' : 'secondary'}
        className={cn(
          'cursor-pointer text-[10px] font-normal transition-colors',
          !active && 'hover:bg-brand/15 hover:text-brand',
          className,
        )}
      >
        {tag}
      </Badge>
    </button>
  );
}
