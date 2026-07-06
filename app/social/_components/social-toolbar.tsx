'use client';

import { useEffect, useState } from 'react';
import { Search, X, Layers, Radio } from '@/lib/icons';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { VirtualizedMultiSelect } from '@/components/ui/virtualized-multi-select';
import type { SocialSort } from '@/lib/shared/social-filter';
import { cn } from '@/lib/shared/utils';
import { useSocialFilter } from './social-filter-context';
import type { SocialView } from './social-views';

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

/** Segmentierte Steuerung im Mock-Stil (bg-fill-Mulde, aktives Segment weiß
 *  mit Schatten und brand-Text). */
function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: ReactNodeIcon }[];
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-[9px] bg-fill p-[3px]"
    >
      {options.map((o) => {
        const on = value === o.value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-xs font-semibold transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              on
                ? 'bg-surface text-brand shadow-[0_1px_2px_rgba(16,32,46,.1)] dark:bg-input/40 dark:text-brand-300'
                : 'text-ink-subtle hover:text-foreground',
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
type ReactNodeIcon = React.ComponentType<{ className?: string }>;

/**
 * Toolbar im Mock-Layout: Ansicht-Umschalter (Themen | Nach Kanal) links,
 * Suche in der Mitte, Sortierung (Neueste | Beliebteste) rechts — darunter die
 * Facetten-Zeile (Kanal-Auswahl, Zeitraum, aktive Chips, Zähler, Reset).
 * Instant client-side filtering with a debounced search input.
 */
export function SocialToolbar({
  view,
  onView,
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
  onClearAll,
}: {
  view: SocialView;
  onView: (v: SocialView) => void;
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
  /** Owner-level reset of every facet (shared with the filtered-empty state). */
  onClearAll: () => void;
}) {
  // Local input + debounce so each keystroke doesn't re-filter the whole tree.
  const [text, setText] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => onQuery(text), 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // Sync the local input when `query` is cleared/changed from outside (the
  // shared Clear-All path lives in the parent now). Adjust-state-during-render:
  // fires only when the prop actually changed, and typing keeps text===query so
  // it never loops.
  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    if (query !== text) setText(query);
  }

  const { activeTags, toggleTag } = useSocialFilter();
  const hasFilters =
    query.trim() !== '' || selectedChannels.length > 0 || activeTags.length > 0 || range !== null;
  const labelFor = (v: string) => channelOptions.find((o) => o.value === v)?.label ?? v;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2.5">
        <Segmented
          value={view}
          onChange={onView}
          ariaLabel="Ansicht wählen"
          options={[
            { value: 'themen', label: 'Themen', icon: Layers },
            { value: 'kanaele', label: 'Nach Kanal', icon: Radio },
          ]}
        />

        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Posts, Themen, @Kanäle durchsuchen …"
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

        <Segmented
          value={sort}
          onChange={onSort}
          ariaLabel="Sortierung"
          options={[
            { value: 'recent', label: 'Neueste' },
            { value: 'engaged', label: 'Beliebteste' },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <VirtualizedMultiSelect
          items={channelOptions.map((o) => ({ value: o.value, label: o.label }))}
          value={selectedChannels}
          onChange={onSelectedChannels}
          placeholder="Alle Kanäle"
          searchPlaceholder="Kanal suchen …"
          emptyMessage="Kein Kanal"
          triggerClassName="h-7 w-[160px] text-xs"
        />

        {/* Single-select → radiogroup semantics (not aria-pressed toggles). */}
        <div className="inline-flex items-center rounded-md border border-line p-0.5" role="radiogroup" aria-label="Zeitraum">
          {RANGES.map((r) => {
            const checked = range === r.val;
            return (
              <button
                key={r.label}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                onClick={() => onRange(r.val)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    const i = RANGES.findIndex((x) => x.val === range);
                    onRange(RANGES[(i + 1) % RANGES.length].val);
                  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    const i = RANGES.findIndex((x) => x.val === range);
                    onRange(RANGES[(i - 1 + RANGES.length) % RANGES.length].val);
                  }
                }}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  checked ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        <span className="font-mono tabular-nums">{resultCount} {resultCount === 1 ? 'Post' : 'Posts'}</span>
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
        {range !== null && (
          <Badge variant="default" className="gap-1 font-normal">
            letzte {range} Tage
            <button
              type="button"
              onClick={() => onRange(null)}
              aria-label="Zeitraumfilter entfernen"
              className="rounded hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={onClearAll} className="h-6 px-2 text-xs">
            Alle zurücksetzen
          </Button>
        )}
      </div>
    </div>
  );
}
