'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';

import { Command, CommandInput } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type MultiSelectItem = {
  value: string;
  label: string;
  sublabel?: string;
  /** Optional group key — items with the same group cluster under a sticky header. */
  group?: string;
};

type Props = {
  items: MultiSelectItem[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  /** Explicit display order for groups. Items with groups not in this list go last. */
  groupOrder?: string[];
  /** Human-readable labels for group keys. */
  groupLabels?: Record<string, string>;
  /** Popover content width — defaults to the trigger width. */
  contentWidth?: string;
  /** Visible scroll-area height in pixels. */
  listHeight?: number;
  className?: string;
  triggerClassName?: string;
};

const VIRT_THRESHOLD = 1000;
const ITEM_HEIGHT = 36;
const HEADER_HEIGHT = 28;

type Row =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'item'; item: MultiSelectItem };

export function VirtualizedMultiSelect({
  items,
  value,
  onChange,
  placeholder = 'Auswählen…',
  searchPlaceholder = 'Suchen…',
  emptyMessage = 'Keine Treffer.',
  groupOrder,
  groupLabels,
  contentWidth,
  listHeight = 320,
  className,
  triggerClassName,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const selectedSet = React.useMemo(() => new Set(value), [value]);
  const itemByValue = React.useMemo(() => {
    const m = new Map<string, MultiSelectItem>();
    for (const it of items) m.set(it.value, it);
    return m;
  }, [items]);

  // Manual filter — cmdk's internal scoring is slow at >800 items.
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      it.label.toLowerCase().includes(q) ||
      (it.sublabel ? it.sublabel.toLowerCase().includes(q) : false) ||
      it.value.toLowerCase().includes(q),
    );
  }, [items, query]);

  // Build flat row list with optional group headers.
  const rows = React.useMemo<Row[]>(() => {
    const hasGroups = filtered.some((it) => it.group);
    if (!hasGroups) return filtered.map((it) => ({ kind: 'item' as const, item: it }));

    const buckets = new Map<string, MultiSelectItem[]>();
    for (const it of filtered) {
      const g = it.group ?? '';
      if (!buckets.has(g)) buckets.set(g, []);
      buckets.get(g)!.push(it);
    }

    const seen = new Set<string>();
    const orderedKeys: string[] = [];
    if (groupOrder) {
      for (const k of groupOrder) {
        if (buckets.has(k)) {
          orderedKeys.push(k);
          seen.add(k);
        }
      }
    }
    for (const k of buckets.keys()) {
      if (!seen.has(k)) orderedKeys.push(k);
    }

    const out: Row[] = [];
    for (const key of orderedKeys) {
      const bucket = buckets.get(key)!;
      const label = groupLabels?.[key] ?? key;
      out.push({ kind: 'header', key: `h-${key}`, label });
      for (const it of bucket) out.push({ kind: 'item', item: it });
    }
    return out;
  }, [filtered, groupOrder, groupLabels]);

  const useVirt = rows.length > VIRT_THRESHOLD;
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (rows[i]?.kind === 'header' ? HEADER_HEIGHT : ITEM_HEIGHT),
    overscan: 12,
    enabled: useVirt && open,
  });

  const toggle = React.useCallback(
    (val: string) => {
      if (selectedSet.has(val)) {
        onChange(value.filter((v) => v !== val));
      } else {
        onChange([...value, val]);
      }
    },
    [onChange, selectedSet, value],
  );

  const clearAll = () => onChange([]);

  const buttonLabel =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? itemByValue.get(value[0])?.label ?? `${value.length} ausgewählt`
        : `${value.length} ausgewählt`;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal', triggerClassName, className)}
        >
          <span className="truncate text-left">{buttonLabel}</span>
          <span className="flex items-center gap-1 shrink-0">
            {value.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {value.length}
              </Badge>
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="p-0"
        style={{ width: contentWidth ?? 'var(--radix-popover-trigger-width)' }}
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={searchPlaceholder}
          />
          {rows.length === 0 ? (
            <div className="py-6 text-center text-sm text-neutral-500">{emptyMessage}</div>
          ) : useVirt ? (
            <div
              ref={parentRef}
              className="overflow-auto"
              style={{ height: listHeight }}
            >
              <div
                style={{
                  height: virtualizer.getTotalSize(),
                  width: '100%',
                  position: 'relative',
                }}
              >
                {virtualizer.getVirtualItems().map((vRow) => {
                  const row = rows[vRow.index];
                  return (
                    <div
                      key={vRow.key}
                      data-index={vRow.index}
                      ref={virtualizer.measureElement}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${vRow.start}px)`,
                      }}
                    >
                      {row.kind === 'header' ? (
                        <GroupHeader label={row.label} />
                      ) : (
                        <RowItem
                          item={row.item}
                          checked={selectedSet.has(row.item.value)}
                          onToggle={() => toggle(row.item.value)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="overflow-auto" style={{ maxHeight: listHeight }}>
              {rows.map((row, i) =>
                row.kind === 'header' ? (
                  <GroupHeader key={`h-${i}`} label={row.label} />
                ) : (
                  <RowItem
                    key={row.item.value}
                    item={row.item}
                    checked={selectedSet.has(row.item.value)}
                    onToggle={() => toggle(row.item.value)}
                  />
                ),
              )}
            </div>
          )}
          {value.length > 0 && (
            <div className="border-t px-3 py-2 flex items-center justify-between text-xs">
              <span className="text-neutral-500">{value.length} ausgewählt</span>
              <button
                type="button"
                onClick={clearAll}
                className="flex items-center gap-1 text-neutral-500 hover:text-neutral-900 transition-colors"
              >
                <X className="h-3 w-3" /> Alle entfernen
              </button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function GroupHeader({ label }: { label: string }) {
  return (
    <div
      className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500 bg-neutral-50 border-b border-neutral-100"
      style={{ height: HEADER_HEIGHT }}
    >
      {label}
    </div>
  );
}

function RowItem({
  item,
  checked,
  onToggle,
}: {
  item: MultiSelectItem;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      role="option"
      aria-selected={checked}
      onClick={onToggle}
      className={cn(
        'flex items-center gap-2 px-3 py-2 cursor-pointer text-sm hover:bg-neutral-100',
        checked && 'bg-neutral-50',
      )}
      style={{ height: ITEM_HEIGHT }}
    >
      <span
        className={cn(
          'flex items-center justify-center h-4 w-4 rounded border shrink-0',
          checked ? 'bg-[#0047bb] border-[#0047bb] text-white' : 'border-neutral-300 bg-white',
        )}
      >
        {checked && <Check className="h-3 w-3" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block truncate">{item.label}</span>
        {item.sublabel && (
          <span className="block text-xs text-neutral-500 truncate">{item.sublabel}</span>
        )}
      </span>
    </div>
  );
}
