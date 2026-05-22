'use client';

import * as React from 'react';
import { de } from 'date-fns/locale';
import { CalendarIcon, Check, ChevronsUpDown, SlidersHorizontal } from 'lucide-react';
import { InfoBubble } from '@/components/info-bubble';
import type { EXPL } from '@/lib/client/explanations';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

import {
  VirtualizedMultiSelect,
  type MultiSelectItem,
} from '@/components/ui/virtualized-multi-select';
import { cn } from '@/lib/shared/utils';

import type { FilterValues, TriState } from '../_filters';
import { SUPER_DOMAIN_LABELS, SUPER_DOMAINS } from '../_constants';
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
        <SheetHeader className="sticky top-0 z-10 bg-background border-b px-5 py-4">
          <SheetTitle>Filter</SheetTitle>
          <SheetDescription className="sr-only">
            Publikationen nach Score, Zeitraum, Typ und weiteren Kriterien filtern und sortieren.
          </SheetDescription>
        </SheetHeader>
        <div className="px-5 py-5 space-y-6">
          <PublicationTypeFacet filters={filters} setFilters={setFilters} lookups={lookups} />
          <Separator />
          <InstituteFacet filters={filters} setFilters={setFilters} lookups={lookups} />
          <Separator />
          <Oestat6Facet filters={filters} setFilters={setFilters} lookups={lookups} />
          <Separator />
          <VenueFacet filters={filters} setFilters={setFilters} lookups={lookups} />
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
  if (f.journal) n++;
  if (f.peer !== 'any') n++;
  if (f.popsci !== 'any') n++;
  if (f.oa !== 'any') n++;
  if (f.hasSumDe || f.hasSumEn || f.hasPdf || f.hasDoi) n++;
  if (f.maHl || f.hl) n++;
  if (f.flagged) n++;
  if (f.pressReleased !== 'any') n++;
  if (f.from || f.to) n++;
  if (f.minScore > 0) n++;
  if (f.enrich || f.analysis) n++;
  return n;
}

function FacetSection({
  title,
  hint,
  explId,
  children,
}: {
  title: string;
  hint?: string;
  explId?: keyof typeof EXPL;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <header>
        <h3 className="text-sm font-semibold inline-flex items-center gap-1">
          {title}
          {explId && <InfoBubble id={explId} size="sm" />}
        </h3>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
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
    <div className="inline-flex rounded-md border bg-muted/50 p-0.5">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            'px-3 py-1 text-xs rounded-sm font-medium transition-colors',
            value === o.key
              ? 'bg-card shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground',
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
          : 'bg-card text-foreground border-border hover:border-muted-foreground/50',
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
    <FacetSection title="Publikationstyp" explId="filter_publikationstyp" hint="26 Typen; Standard blendet Theses, Poster usw. aus.">
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
      label: o.akronym_de ? `${o.akronym_de}: ${o.name_de}` : o.name_de,
      sublabel: o.name_en ?? undefined,
    }));
  }, [lookups, filters.topUnitOnly]);

  return (
    <FacetSection title="Institut" explId="filter_institut" hint={`${items.length.toLocaleString('de-AT')} verfügbar`}>
      <label className="flex items-center justify-between text-xs text-foreground cursor-pointer">
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
      explId="filter_oestat6"
      hint="1.411 Kategorien, gruppiert nach Super-Domäne."
    >
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setActiveSuper('all')}
          className={cn(
            'rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
            activeSuper === 'all'
              ? 'bg-foreground text-background border-foreground'
              : 'bg-card text-foreground border-border hover:border-muted-foreground/50',
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
                ? 'bg-foreground text-background border-foreground'
                : 'bg-card text-foreground border-border hover:border-muted-foreground/50',
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

// Venue facet: searchable single-select over the top-N venues (use-lookups →
// /api/venues). Single-select because `journal` is one exact venue string —
// venue names contain commas, so an array param with a separator is fragile.
// A venue outside the top N is still reachable via its VenueLine in a row.
function VenueFacet({ filters, setFilters, lookups }: Props) {
  const [open, setOpen] = React.useState(false);
  const venues = lookups?.venues ?? [];
  const selected = filters.journal;

  return (
    <FacetSection
      title="Venue"
      explId="venue"
      hint={
        lookups
          ? `Top ${venues.length.toLocaleString('de-AT')} nach Häufigkeit`
          : undefined
      }
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal h-9"
          >
            <span className={cn('truncate', !selected && 'text-muted-foreground')}>
              {selected || 'Venue wählen…'}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] p-0"
        >
          <Command>
            <CommandInput placeholder="Venue suchen…" />
            <CommandList>
              <CommandEmpty>Keine Venue gefunden.</CommandEmpty>
              <CommandGroup>
                {venues.map((v) => (
                  <CommandItem
                    key={v.venue}
                    value={v.venue}
                    onSelect={() => {
                      setFilters({
                        journal: v.venue === selected ? '' : v.venue,
                        page: 1,
                      });
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'h-4 w-4 shrink-0',
                        v.venue === selected ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="min-w-0 truncate">{v.venue}</span>
                    <span className="ml-auto tabular-nums text-xs text-muted-foreground">
                      {v.count.toLocaleString('de-AT')}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected && (
        <button
          type="button"
          onClick={() => setFilters({ journal: '', page: 1 })}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Venue entfernen
        </button>
      )}
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
      <span className="text-xs text-foreground">{label}</span>
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
        <ToggleChip
          active={filters.flagged}
          label="Geflaggt für Sitzung"
          onChange={(v) => setFilters({ flagged: v, page: 1 })}
        />
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-foreground inline-flex items-center gap-1">
            ÖAW-Pressemitteilung
            <InfoBubble id="filter_press_released" />
          </span>
          <TriStateTabs
            value={filters.pressReleased}
            onChange={(pressReleased) => setFilters({ pressReleased, page: 1 })}
          />
        </div>
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
            <span className={cn(!filters.from && !filters.to && 'text-muted-foreground')}>
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
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
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
    <FacetSection title="Mindest-Score" explId="filter_min_score" hint="Nur analysierte Publikationen mit Score ≥ X.">
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
