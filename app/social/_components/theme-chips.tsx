'use client';

import { Layers } from '@/lib/icons';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/shared/utils';

export interface ThemeChipItem {
  key: string;
  title: string;
  count: number;
}

/** The Lagebild themes as clickable fields: clicking jumps to the Themen view
 *  and opens that theme's posts. Complements the accordion (an at-a-glance,
 *  always-visible entry point into each topic). */
export function ThemeChips({
  themes,
  activeKey,
  onSelect,
}: {
  themes: ThemeChipItem[];
  activeKey: string | null;
  onSelect: (key: string) => void;
}) {
  if (themes.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Layers className="h-3.5 w-3.5" aria-hidden />
        Themen:
      </span>
      {themes.map((t) => {
        const active = activeKey === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onSelect(t.key)}
            aria-pressed={active}
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Badge
              variant={active ? 'default' : 'outline'}
              className={cn(
                'cursor-pointer gap-1 font-normal transition-colors',
                !active && 'hover:bg-brand/10 hover:text-brand',
              )}
            >
              {t.title}
              <span className="opacity-60">{t.count}</span>
            </Badge>
          </button>
        );
      })}
    </div>
  );
}
