'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/shared/utils';
import { SORT_OPTIONS } from '../_constants';
import type { FilterValues, SortOrder } from '../_filters';

type Patch = Partial<FilterValues>;

interface Props {
  sort: string;
  order: SortOrder;
  setFilters: (patch: Patch) => void;
  /** Kompaktvariante (nur Icon) für die mobile Suchzeile. */
  compact?: boolean;
}

/**
 * Sortier-Auswahl für die Publikationsliste. Ersetzt die klickbaren
 * Spaltenköpfe der alten Tabelle, die beim Toolkit-Redesign (Karten-Liste)
 * weggefallen sind — die URL-/Query-Mechanik (`sort`/`order`, SORTABLE_COLUMNS)
 * war durchgehend intakt, es fehlte nur das Bedienelement.
 *
 * Feld-Auswahl setzt zugleich die intuitive Richtung (Score/Datum → absteigend,
 * Titel/Autor:in → aufsteigend); die Richtung ist darunter frei umschaltbar.
 * Jede Änderung springt auf Seite 1 zurück.
 */
export function SortDropdown({ sort, order, setFilters, compact }: Props) {
  const active = SORT_OPTIONS.find((o) => o.key === sort) ?? SORT_OPTIONS[1];
  const DirIcon = order === 'asc' ? ArrowUp : ArrowDown;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button
            variant="outline"
            size="sm"
            className="h-10 w-10 shrink-0 p-0"
            aria-label={`Sortierung: ${active.label}, ${order === 'asc' ? 'aufsteigend' : 'absteigend'}`}
          >
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-9 gap-1.5">
            <ArrowUpDown className="h-4 w-4" />
            <span className="max-lg:sr-only">Sortieren:</span>
            <span className="font-medium">{active.label}</span>
            <DirIcon className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Sortieren nach</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={sort}
          onValueChange={(key) => {
            const opt = SORT_OPTIONS.find((o) => o.key === key);
            setFilters({ sort: key, order: opt?.defaultOrder ?? 'desc', page: 1 });
          }}
        >
          {SORT_OPTIONS.map((o) => (
            <DropdownMenuRadioItem key={o.key} value={o.key}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Richtung</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={order}
          onValueChange={(v) => setFilters({ order: v as SortOrder, page: 1 })}
        >
          <DropdownMenuRadioItem value="desc">
            <span className={cn('inline-flex items-center gap-2')}>
              <ArrowDown className="h-3.5 w-3.5" />
              Absteigend
            </span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="asc">
            <span className="inline-flex items-center gap-2">
              <ArrowUp className="h-3.5 w-3.5" />
              Aufsteigend
            </span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
