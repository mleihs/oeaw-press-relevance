'use client';

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { VirtualizedMultiSelect } from '@/components/ui/virtualized-multi-select';
import type { SocialSort } from '@/lib/shared/social-filter';
import { cn } from '@/lib/shared/utils';
import { useSocialFilter } from './social-filter-context';

// Time-range presets as a segmented control (4 options → segmented is ideal;
// all choices visible, one tap). null = Alle (whole lookback window).
const RANGES: { label: string; val: number | null }[] = [
  { label: '7T', val: 7 },
  { label: '14T', val: 14 },
  { label: '30T', val: 30 },
  { label: 'Alle', val: null },
];

export interface ChannelOption {
  value: string;
  label: string;
}

/**
 * Search + faceted filter toolbar for the section (shadcn data-table-toolbar
 * pattern). Instant client-side filtering with a debounced search input,
 * virtualized channel facet (scales to many channels), sort, removable active
 * chips, a result count, and a reset action.
 */
export function SocialToolbar({
  query,
  onQuery,
  channelOptions,
  selectedChannels,
  onSelectedChannels,
  sort,
  onSort,
  range,
  onRange,
  resultCount,
}: {
  query: string;
  onQuery: (q: string) => void;
  channelOptions: ChannelOption[];
  selectedChannels: string[];
  onSelectedChannels: (next: string[]) => void;
  sort: SocialSort;
  onSort: (s: SocialSort) => void;
  range: number | null;
  onRange: (r: number | null) => void;
  resultCount: number;
}) {
  // Local input + debounce so each keystroke doesn't re-filter the whole tree.
  // The only external clear path (clearAll, below) resets `text` itself, so no
  // separate sync-from-prop effect is needed.
  const [text, setText] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => onQuery(text), 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const { activeTags, toggleTag, clearTags } = useSocialFilter();
  const hasFilters = query.trim() !== '' || selectedChannels.length > 0 || activeTags.length > 0;
  const labelFor = (v: string) => channelOptions.find((o) => o.value === v)?.label ?? v;

  const clearAll = () => {
    setText('');
    onQuery('');
    onSelectedChannels([]);
    clearTags?.();
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Suche in Themen, Posts, Schlagworten …"
            aria-label="Social-Media durchsuchen"
            className="pl-8 pr-8"
          />
          {text && (
            <button
              type="button"
              onClick={() => setText('')}
              aria-label="Suche leeren"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <VirtualizedMultiSelect
          items={channelOptions.map((o) => ({ value: o.value, label: o.label }))}
          value={selectedChannels}
          onChange={onSelectedChannels}
          placeholder="Alle Kanäle"
          searchPlaceholder="Kanal suchen …"
          emptyMessage="Kein Kanal"
          triggerClassName="w-[180px]"
        />

        <Select value={sort} onValueChange={(v) => onSort(v as SocialSort)}>
          <SelectTrigger className="w-[170px]" aria-label="Sortierung">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Neueste zuerst</SelectItem>
            <SelectItem value="engaged">Meiste Interaktion</SelectItem>
          </SelectContent>
        </Select>

        <div className="inline-flex items-center rounded-md border p-0.5" role="group" aria-label="Zeitraum">
          {RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => onRange(r.val)}
              aria-pressed={range === r.val}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                range === r.val ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">{resultCount} {resultCount === 1 ? 'Post' : 'Posts'}</span>
        {selectedChannels.map((v) => (
          <Badge key={v} variant="secondary" className="gap-1 font-normal">
            @{labelFor(v)}
            <button
              type="button"
              onClick={() => onSelectedChannels(selectedChannels.filter((x) => x !== v))}
              aria-label={`Filter ${labelFor(v)} entfernen`}
              className="rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {activeTags.map((t) => (
          <Badge key={`tag-${t}`} variant="default" className="gap-1 font-normal">
            #{t}
            <button
              type="button"
              onClick={() => toggleTag?.(t)}
              aria-label={`Tag ${t} entfernen`}
              className="rounded hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="h-6 px-2 text-xs">
            Alle zurücksetzen
          </Button>
        )}
      </div>
    </div>
  );
}
