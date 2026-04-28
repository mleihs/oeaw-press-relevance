'use client';

import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FILTER_DEFAULTS, type FilterValues } from '../_filters';
import type { Lookups } from './use-lookups';
import { SUPER_DOMAIN_LABELS } from '../_constants';

type Patch = Partial<FilterValues>;

type Props = {
  filters: FilterValues;
  setFilters: (patch: Patch) => void;
  lookups: Lookups | null;
};

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Badge variant="outline" className="gap-1 pr-1 py-0.5 text-xs font-normal bg-white">
      <span className="truncate max-w-[200px]">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-sm hover:bg-neutral-100 transition-colors"
        aria-label="Filter entfernen"
      >
        <X className="h-3 w-3 text-neutral-500" />
      </button>
    </Badge>
  );
}

function fmtDate(iso: string) {
  if (!iso) return iso;
  try {
    return new Date(iso).toLocaleDateString('de-AT');
  } catch {
    return iso;
  }
}

export function ActiveFilters({ filters, setFilters, lookups }: Props) {
  const chips: Array<{ key: string; label: string; remove: () => void }> = [];

  if (filters.q) {
    chips.push({
      key: 'q',
      label: `Suche: "${filters.q}"`,
      remove: () => setFilters({ q: '', page: 1 }),
    });
  }

  for (const id of filters.types) {
    const t = lookups?.publicationTypes.find((x) => x.id === id);
    chips.push({
      key: `t-${id}`,
      label: `Typ: ${t?.name_de ?? id.slice(0, 8)}`,
      remove: () =>
        setFilters({ types: filters.types.filter((x) => x !== id), page: 1 }),
    });
  }

  for (const id of filters.units) {
    const u = lookups?.orgunits.find((x) => x.id === id);
    chips.push({
      key: `u-${id}`,
      label: `Institut: ${u?.akronym_de || u?.name_de || id.slice(0, 8)}`,
      remove: () =>
        setFilters({ units: filters.units.filter((x) => x !== id), page: 1 }),
    });
  }

  if (filters.topUnitOnly) {
    chips.push({
      key: 'topunit',
      label: 'nur Top-Level-Institute',
      remove: () => setFilters({ topUnitOnly: false, page: 1 }),
    });
  }

  for (const id of filters.oestat) {
    const o = lookups?.oestat6.find((x) => x.id === id);
    chips.push({
      key: `o-${id}`,
      label: `ÖSTAT6 ${o?.webdb_uid ?? ''} ${o?.name_de ?? ''}`.trim(),
      remove: () =>
        setFilters({ oestat: filters.oestat.filter((x) => x !== id), page: 1 }),
    });
  }

  for (const code of filters.oestat3) {
    chips.push({
      key: `o3-${code}`,
      label: `Domain ${code}xx ${SUPER_DOMAIN_LABELS[Math.floor(code / 100)] ?? ''}`,
      remove: () =>
        setFilters({
          oestat3: filters.oestat3.filter((c) => c !== code),
          page: 1,
        }),
    });
  }

  if (filters.peer !== 'any') {
    chips.push({
      key: 'peer',
      label: `Peer-reviewed: ${filters.peer === 'yes' ? 'ja' : 'nein'}`,
      remove: () => setFilters({ peer: 'any', page: 1 }),
    });
  }

  if (filters.popsci !== 'any') {
    chips.push({
      key: 'popsci',
      label: `Popular Science: ${filters.popsci === 'yes' ? 'ja' : 'nein'}`,
      remove: () => setFilters({ popsci: 'any', page: 1 }),
    });
  }

  if (filters.oa !== 'any') {
    chips.push({
      key: 'oa',
      label: `Open Access: ${filters.oa === 'yes' ? 'ja' : 'nein'}`,
      remove: () => setFilters({ oa: 'any', page: 1 }),
    });
  }

  if (filters.hasSumDe) {
    chips.push({
      key: 'sumDe',
      label: 'mit DE-Zusammenfassung',
      remove: () => setFilters({ hasSumDe: false, page: 1 }),
    });
  }
  if (filters.hasSumEn) {
    chips.push({
      key: 'sumEn',
      label: 'mit EN-Zusammenfassung',
      remove: () => setFilters({ hasSumEn: false, page: 1 }),
    });
  }
  if (filters.hasPdf) {
    chips.push({
      key: 'pdf',
      label: 'mit PDF',
      remove: () => setFilters({ hasPdf: false, page: 1 }),
    });
  }
  if (filters.hasDoi) {
    chips.push({
      key: 'doi',
      label: 'mit DOI',
      remove: () => setFilters({ hasDoi: false, page: 1 }),
    });
  }
  if (filters.maHl) {
    chips.push({
      key: 'maHl',
      label: 'Eigen-Highlight',
      remove: () => setFilters({ maHl: false, page: 1 }),
    });
  }
  if (filters.hl) {
    chips.push({
      key: 'hl',
      label: 'Highlight',
      remove: () => setFilters({ hl: false, page: 1 }),
    });
  }

  if (filters.from) {
    chips.push({
      key: 'from',
      label: `ab ${fmtDate(filters.from)}`,
      remove: () => setFilters({ from: '', page: 1 }),
    });
  }
  if (filters.to) {
    chips.push({
      key: 'to',
      label: `bis ${fmtDate(filters.to)}`,
      remove: () => setFilters({ to: '', page: 1 }),
    });
  }

  if (filters.minScore > 0) {
    chips.push({
      key: 'minScore',
      label: `min. Score ${filters.minScore}`,
      remove: () => setFilters({ minScore: 0, page: 1 }),
    });
  }

  if (filters.enrich) {
    chips.push({
      key: 'enrich',
      label: `Enrichment: ${filters.enrich}`,
      remove: () => setFilters({ enrich: '', page: 1 }),
    });
  }
  if (filters.analysis) {
    chips.push({
      key: 'analysis',
      label: `Analyse: ${filters.analysis}`,
      remove: () => setFilters({ analysis: '', page: 1 }),
    });
  }

  if (chips.length === 0) return null;

  const reset = () =>
    setFilters({
      ...FILTER_DEFAULTS,
      sort: filters.sort,
      order: filters.order,
      showAll: filters.showAll,
    });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <Chip key={c.key} label={c.label} onRemove={c.remove} />
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={reset}
        className="h-6 px-2 text-xs text-neutral-500 hover:text-neutral-900"
      >
        Alle Filter zurücksetzen
      </Button>
    </div>
  );
}
