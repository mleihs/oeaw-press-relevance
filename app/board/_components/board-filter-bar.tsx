'use client';

import { Search, X, AlarmClock, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import type { BoardColumn, BoardMember } from '@/lib/shared/board';
import { EMPTY_FILTERS, hasActiveFilters, type BoardFilters } from '../_lib/filter';
import { displayNameOf } from '../_lib/people';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ALL = '__all__';

function Toggle({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof AlarmClock;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium transition-colors',
        active
          ? 'border-brand bg-brand text-white'
          : 'border-input bg-background text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

export function BoardFilterBar({
  filters,
  onChange,
  columns,
  members,
}: {
  filters: BoardFilters;
  onChange: (f: BoardFilters) => void;
  columns: BoardColumn[];
  members: BoardMember[];
}) {
  const activeMembers = members.filter((m) => !m.disabled_at);
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Titel oder Checkliste durchsuchen…"
          className="h-9 w-[280px] pl-8"
        />
        {filters.search && (
          <button
            type="button"
            onClick={() => onChange({ ...filters, search: '' })}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Suche löschen"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <Select
        value={filters.columnId ?? ALL}
        onValueChange={(v) => onChange({ ...filters, columnId: v === ALL ? null : v })}
      >
        <SelectTrigger className="h-9 w-[170px]">
          <SelectValue placeholder="Alle Kanäle" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Alle Kanäle</SelectItem>
          {columns.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.personId ?? ALL}
        onValueChange={(v) =>
          onChange({ ...filters, personId: v === ALL ? null : (v as BoardFilters['personId']) })
        }
      >
        <SelectTrigger className="h-9 w-[180px]">
          <SelectValue placeholder="Alle Personen" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Alle Personen</SelectItem>
          <SelectItem value="unassigned">Nicht zugewiesen</SelectItem>
          {activeMembers.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {displayNameOf(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Toggle
        active={filters.onlyOverdue}
        onClick={() => onChange({ ...filters, onlyOverdue: !filters.onlyOverdue })}
        icon={AlarmClock}
        label="Nur überfällig"
      />
      <Toggle
        active={filters.showCompleted}
        onClick={() => onChange({ ...filters, showCompleted: !filters.showCompleted })}
        icon={CheckCircle2}
        label="Erledigte zeigen"
      />

      {hasActiveFilters(filters) && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="text-[13px] font-medium text-muted-foreground hover:text-foreground"
        >
          Zurücksetzen
        </button>
      )}
    </div>
  );
}
