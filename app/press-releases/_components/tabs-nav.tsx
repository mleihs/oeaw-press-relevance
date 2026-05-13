import Link from 'next/link';
import { Layers, Link2, FileQuestion, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/shared/utils';
import {
  TAB_VALUES,
  type PressReleasesStats,
  type Tab,
} from '@/lib/server/press-releases/list';

// Display metadata for each tab — keyed by the canonical `Tab` values from
// the data layer. Adding a tab in `list.ts::TAB_VALUES` surfaces here as
// a `Record`-completeness TS error.
const TAB_DISPLAY: Record<
  Tab,
  { label: string; Icon: LucideIcon; statsKey: keyof PressReleasesStats }
> = {
  all:     { label: 'Alle',           Icon: Layers,       statsKey: 'total' },
  matched: { label: 'Mit Pub-Match',  Icon: Link2,        statsKey: 'matched' },
  orphans: { label: 'Ohne Pub-Match', Icon: FileQuestion, statsKey: 'orphans' },
};

/**
 * URL-driven tab navigation rendered as `<nav>` + `<Link>` triggers.
 *
 * Replaces the shadcn `Tabs` primitive for THIS page because the tabs are
 * nav-as-routes (each tab is a URL the page reads via `searchParams`), not
 * in-page state. `<Link replace scroll={false} prefetch={false}>` keeps
 * history clean, preserves scroll position, and skips dev-mode prefetch
 * roundtrips (production gets its prefetch behaviour from the parent
 * navigation; in-tab links are sub-second soft-nav anyway).
 *
 * Default tab ('all') uses the canonical URL with no `?tab=` query so
 * URL-shares don't dump `?tab=all` into bookmarks.
 *
 * Visual fidelity: matches shadcn `Tabs` default variant (rounded `bg-muted`
 * container, active trigger gets `bg-background` + `shadow-sm`).
 */
export function PressReleasesTabsNav({
  activeTab,
  stats,
}: {
  activeTab: Tab;
  stats: PressReleasesStats;
}) {
  return (
    <nav
      aria-label="Pressemitteilungen filtern"
      className="bg-muted text-muted-foreground rounded-lg p-[3px] h-9 inline-flex w-full sm:w-auto items-center justify-center"
    >
      {TAB_VALUES.map((value) => {
        const { label, Icon, statsKey } = TAB_DISPLAY[value];
        const isActive = value === activeTab;
        const href = value === 'all' ? '/press-releases' : `/press-releases?tab=${value}`;
        return (
          <Link
            key={value}
            href={href}
            replace
            scroll={false}
            prefetch={false}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5',
              'h-[calc(100%-1px)] rounded-md border border-transparent px-2 py-1',
              'text-sm font-medium whitespace-nowrap transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isActive
                ? 'bg-background text-foreground shadow-sm dark:bg-input/30 dark:border-input dark:text-foreground'
                : 'text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            <Badge variant="secondary" className="ml-0.5 text-[10px] px-1.5 py-0 tabular-nums">
              {stats[statsKey]}
            </Badge>
          </Link>
        );
      })}
    </nav>
  );
}
