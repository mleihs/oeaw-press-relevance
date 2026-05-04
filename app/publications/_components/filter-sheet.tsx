'use client';

import * as React from 'react';
import { de } from 'date-fns/locale';
import { CalendarIcon, SlidersHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

import {
  VirtualizedMultiSelect,
  type MultiSelectItem,
} from '@/components/ui/virtualized-multi-select';
import { cn } from '@/lib/utils';

import type { FilterValues, TriState } from '../_filters';
import { SUPER_DOMAIN_LABELS } from '../_constants';
import type { Lookups } from './use-lookups';

type Patch = Partial<FilterValues>;

type Props = {
  filters: FilterValues;
  setFilters: (patch: Patch) => void;
  lookups: Lookups | null;
};

export function FilterSheet({ filters, setFilters, lookups }: Props) {
  const [open, setOpen] = React.useState(false);

  const dimensionalCount = countDimensionalFilters(filters);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <SlidersHorizontal className="h-4 w-4" />
          <span>Filter</span>
          {dimensionalCount > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {dimensionalCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
        <SheetHeader className="sticky top-0 z-10 bg-white border-b px-5 py-4">
          <SheetTitle>Filter</SheetTitle>
        </SheetHeader>
        <div className="px-5 py-5 space-y-6">
          <PublicationTypeFacet filters={filters} setFilters={setFilters} lookups={lookups} />
          <Separator />
          <InstituteFacet filters={filters} setFilters={setFilters} lookups={lookups} />
          <Separator />
          <Oestat6Facet filters={filters} setFilters={setFilters} lookups={lookups} />
          <Separator />
          <BooleansFacet filters={filters} setFilters={setFilters} />
          <Separator />
          <QualityFacet filters={filters} setFilters={setFilters} />
          <Separator />
          <CurationFacet filters={filters} setFilters={setFilters} />
          <Separator />
          <DateRangeFacet filters={filters} setFilters={setFilters} />
          <Separator />
          <ScoreFacet filters={filters} setFilters={setFilters} />
          <Separator />
          <PipelineStatusFacet filters={filters} setFilters={setFilters} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function countDimensionalFilters(f: FilterValues): number {
  let n = 0;
  if (f.types.length) n++;
  if (f.units.length || f.topUnitOnly) n++;
  if (f.oestat.length || f.oestat3.length) n++;
  if (f.peer !== 'any') n++;
  if (f.popsci !== 'any') n++;
  if (f.oa !== 'any') n++;
  if (f.hasSumDe || f.hasSumEn || f.hasPdf || f.hasDoi) n++;
  if (f.maHl || f.hl) n++;
  if (f.from || f.to) n++;
  if (f.minScore > 0) n++;
  if (f.enrich || f.analysis) n++;
  return n;
}

function FacetSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <header>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-xs text-neutral-500 mt-0.5">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

function TriStateTabs({
  value,
  onChange,
}: {
  value: TriState;
  onChange: (next: TriState) => void;
}) {
  const opts: Array<{ key: TriState; label: string }> = [
    { key: 'any', label: 'Egal' },
    { key: 'yes', label: 'Ja' },
    { key: 'no', label: 'Nein' },
  ];
  return (
    <div className="inline-flex rounded-md border bg-neutral-50 p-0.5">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            'px-3 py-1 text-xs rounded-sm font-medium transition-colors',
            value === o.key
              ? 'bg-white shadow-sm text-neutral-900'
              : 'text-neutral-500 hover:text-neutral-700',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ToggleChip({
  active,
  label,
  onChange,
}: {
  active: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'bg-brand text-white border-brand'
          : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400',
      )}
    >
      {label}
    </button>
  );
}

function PublicationTypeFacet({ filters, setFilters, lookups }: Props) {
  const items: MultiSelectItem[] = React.useMemo(
    () =>
      (lookups?.publicationTypes ?? []).map((t) => ({
        value: t.id,
        label: t.name_de,
        sublabel: t.name_en,
      })),
    [lookups],
  );
  return (
    <FacetSection title="Publikationstyp" hint="26 Typen — Standard blendet Theses, Poster usw. aus.">
      <VirtualizedMultiSelect
        items={items}
        value={filters.types}
        onChange={(types) => setFilters({ types, page: 1 })}
        placeholder="Typ wählen…"
      />
    </FacetSection>
  );
}

function InstituteFacet({ filters, setFilters, lookups }: Props) {
  const items: MultiSelectItem[] = React.useMemo(() => {
    const all = lookups?.orgunits ?? [];
    // "topUnitOnly" zeigt jetzt nur die echten ÖAW-Forschungseinrichtungen
    // (vom API-Endpoint per is_research_unit markiert) — exkludiert Bereiche,
    // Mitgliederverwaltungen und Subakronyme wie IMAFO_AG_Preiser-Kapeller.
    const filtered = filters.topUnitOnly ? all.filter((o) => o.is_research_unit) : all;
    return filtered.map((o) => ({
      value: o.id,
      label: o.akronym_de ? `${o.akronym_de} — ${o.name_de}` : o.name_de,
      sublabel: o.name_en ?? undefined,
    }));
  }, [lookups, filters.topUnitOnly]);

  return (
    <FacetSection title="Institut" hint={`${items.length.toLocaleString('de-AT')} verfügbar`}>
      <label className="flex items-center justify-between text-xs text-neutral-700 cursor-pointer">
        <span>nur Forschungseinrichtungen</span>
        <Switch
          checked={filters.topUnitOnly}
          onCheckedChange={(topUnitOnly) =>
            setFilters({ topUnitOnly, page: 1 })
          }
        />
      </label>
      <VirtualizedMultiSelect
        items={items}
        value={filters.units}
        onChange={(units) => setFilters({ units, page: 1 })}
        placeholder="Institut wählen…"
        searchPlaceholder="Akronym oder Name suchen…"
      />
    </FacetSection>
  );
}

const SUPER_DOMAINS = [1, 2, 3, 4, 5, 6] as const;

function Oestat6Facet({ filters, setFilters, lookups }: Props) {
  const [activeSuper, setActiveSuper] = React.useState<number | 'all'>('all');

  const items: MultiSelectItem[] = React.useMemo(() => {
    const all = lookups?.oestat6 ?? [];
    const visible = activeSuper === 'all' ? all : all.filter((o) => o.super_domain === activeSuper);
    return visible.map((o) => ({
      value: o.id,
      label: `${o.webdb_uid} ${o.name_de}`,
      sublabel: o.name_en,
      group: activeSuper === 'all' ? String(o.super_domain) : undefined,
    }));
  }, [lookups, activeSuper]);

  const groupOrder = SUPER_DOMAINS.map(String);
  const groupLabels = Object.fromEntries(
    SUPER_DOMAINS.map((d) => [String(d), `${d}xx ${SUPER_DOMAIN_LABELS[d] ?? ''}`]),
  );

  return (
    <FacetSection
      title="Forschungsgebiet (ÖSTAT6)"
      hint="1.411 Kategorien, gruppiert nach Super-Domäne."
    >
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setActiveSuper('all')}
          className={cn(
            'rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
            activeSuper === 'all'
              ? 'bg-neutral-900 text-white border-neutral-900'
              : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400',
          )}
        >
          Alle
        </button>
        {SUPER_DOMAINS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setActiveSuper(d)}
            className={cn(
              'rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
              activeSuper === d
                ? 'bg-neutral-900 text-white border-neutral-900'
                : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400',
            )}
            title={SUPER_DOMAIN_LABELS[d]}
          >
            {d}xx
          </button>
        ))}
      </div>
      <VirtualizedMultiSelect
        items={items}
        value={filters.oestat}
        onChange={(oestat) => setFilters({ oestat, page: 1 })}
        groupOrder={groupOrder}
        groupLabels={groupLabels}
        placeholder="Forschungsgebiet wählen…"
        searchPlaceholder="Code oder Name suchen…"
      />
    </FacetSection>
  );
}

function BooleansFacet({
  filters,
  setFilters,
}: {
  filters: FilterValues;
  setFilters: (p: Patch) => void;
}) {
  return (
    <FacetSection title="Merkmale">
      <div className="space-y-2">
        <Row label="Peer-reviewed">
          <TriStateTabs
            value={filters.peer}
            onChange={(peer) => setFilters({ peer, page: 1 })}
          />
        </Row>
        <Row label="Popular Science">
          <TriStateTabs
            value={filters.popsci}
            onChange={(popsci) => setFilters({ popsci, page: 1 })}
          />
        </Row>
        <Row label="Open Access">
          <TriStateTabs
            value={filters.oa}
            onChange={(oa) => setFilters({ oa, page: 1 })}
          />
        </Row>
      </div>
    </FacetSection>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-neutral-700">{label}</span>
      {children}
    </div>
  );
}

function QualityFacet({
  filters,
  setFilters,
}: {
  filters: FilterValues;
  setFilters: (p: Patch) => void;
}) {
  return (
    <FacetSection title="Verfügbares Material">
      <div className="flex flex-wrap gap-1.5">
        <ToggleChip
          active={filters.hasSumDe}
          label="DE-Zusammenfassung"
          onChange={(v) => setFilters({ hasSumDe: v, page: 1 })}
        />
        <ToggleChip
          active={filters.hasSumEn}
          label="EN-Zusammenfassung"
          onChange={(v) => setFilters({ hasSumEn: v, page: 1 })}
        />
        <ToggleChip
          active={filters.hasPdf}
          label="PDF"
          onChange={(v) => setFilters({ hasPdf: v, page: 1 })}
        />
        <ToggleChip
          active={filters.hasDoi}
          label="DOI"
          onChange={(v) => setFilters({ hasDoi: v, page: 1 })}
        />
      </div>
    </FacetSection>
  );
}

function CurationFacet({
  filters,
  setFilters,
}: {
  filters: FilterValues;
  setFilters: (p: Patch) => void;
}) {
  return (
    <FacetSection title="Kuration">
      <div className="flex flex-wrap gap-1.5">
        <ToggleChip
          active={filters.maHl}
          label="Eigen-Highlight"
          onChange={(v) => setFilters({ maHl: v, page: 1 })}
        />
        <ToggleChip
          active={filters.hl}
          label="Highlight"
          onChange={(v) => setFilters({ hl: v, page: 1 })}
        />
      </div>
    </FacetSection>
  );
}

function toIsoDate(d: Date | undefined): string {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function DateRangeFacet({
  filters,
  setFilters,
}: {
  filters: FilterValues;
  setFilters: (p: Patch) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const range = {
    from: filters.from ? new Date(filters.from + 'T00:00:00') : undefined,
    to: filters.to ? new Date(filters.to + 'T00:00:00') : undefined,
  };

  const label =
    filters.from || filters.to
      ? `${filters.from ? new Date(filters.from + 'T00:00:00').toLocaleDateString('de-AT') : '…'} – ${filters.to ? new Date(filters.to + 'T00:00:00').toLocaleDateString('de-AT') : '…'}`
      : 'Zeitraum wählen…';

  return (
    <FacetSection title="Erscheinungsdatum">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-start font-normal h-9">
            <CalendarIcon className="h-4 w-4 mr-2 opacity-60" />
            <span className={cn(!filters.from && !filters.to && 'text-neutral-500')}>
              {label}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="range"
            selected={range}
            onSelect={(r) =>
              setFilters({
                from: toIsoDate(r?.from),
                to: toIsoDate(r?.to),
                page: 1,
              })
            }
            locale={de}
            weekStartsOn={1}
            numberOfMonths={2}
            captionLayout="dropdown"
            startMonth={new Date(1990, 0)}
            endMonth={new Date(new Date().getFullYear() + 1, 11)}
          />
        </PopoverContent>
      </Popover>
      {(filters.from || filters.to) && (
        <button
          type="button"
          onClick={() => setFilters({ from: '', to: '', page: 1 })}
          className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          Zeitraum entfernen
        </button>
      )}
    </FacetSection>
  );
}

function ScoreFacet({
  filters,
  setFilters,
}: {
  filters: FilterValues;
  setFilters: (p: Patch) => void;
}) {
  return (
    <FacetSection title="Mindest-Score" hint="Nur analysierte Publikationen mit Score ≥ X.">
      <div className="flex items-center gap-3">
        <Slider
          value={[filters.minScore]}
          onValueChange={(v) =>
            setFilters({ minScore: v[0] ?? 0, page: 1 })
          }
          min={0}
          max={100}
          step={5}
          className="flex-1"
        />
        <span className="text-xs font-medium tabular-nums w-10 text-right">
          {filters.minScore}
        </span>
      </div>
    </FacetSection>
  );
}

function PipelineStatusFacet({
  filters,
  setFilters,
}: {
  filters: FilterValues;
  setFilters: (p: Patch) => void;
}) {
  return (
    <FacetSection title="Pipeline-Status">
      <div className="grid grid-cols-2 gap-2">
        <Select
          value={filters.enrich || '_all'}
          onValueChange={(v) =>
            setFilters({
              enrich: v === '_all' ? '' : v,
              page: 1,
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Enrichment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Alle (Enrichment)</SelectItem>
            <SelectItem value="pending">Ausstehend</SelectItem>
            <SelectItem value="enriched">Angereichert</SelectItem>
            <SelectItem value="partial">Teilweise</SelectItem>
            <SelectItem value="failed">Fehlgeschlagen</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.analysis || '_all'}
          onValueChange={(v) =>
            setFilters({
              analysis: v === '_all' ? '' : v,
              page: 1,
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Analyse" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Alle (Analyse)</SelectItem>
            <SelectItem value="pending">Ausstehend</SelectItem>
            <SelectItem value="analyzed">Analysiert</SelectItem>
            <SelectItem value="failed">Fehlgeschlagen</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </FacetSection>
  );
}
