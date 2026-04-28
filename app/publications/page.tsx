'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Publication } from '@/lib/types';
import { useKeyboardShortcuts } from '@/lib/use-keyboard-shortcuts';
import { PublicationTable } from '@/components/publication-table';
import { EnrichmentModal } from '@/components/enrichment-modal';
import { AnalysisModal } from '@/components/analysis-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { getApiHeaders } from '@/lib/settings-store';
import { Search, ChevronLeft, ChevronRight, Sparkles, Brain } from 'lucide-react';

import { useFilters } from './use-filters';
import { FILTER_DEFAULTS, PRESET_FIELDS, type FilterValues, type PresetKey } from './_filters';
import { useLookups } from './_components/use-lookups';
import { PresetBar } from './_components/preset-bar';
import { ActiveFilters } from './_components/active-filters';
import { ShowAllToggle } from './_components/show-all-toggle';
import { FilterSheet } from './_components/filter-sheet';
import { LoadingState } from '@/components/loading-state';
import { WISS_TYPE_UIDS } from './_constants';
import { RotateCcw } from 'lucide-react';

const PAGE_SIZE = 20;

export default function PublicationsPage() {
  const [publications, setPublications] = useState<Publication[]>([]);
  const [total, setTotal] = useState(0);
  const [hidden, setHidden] = useState(0);
  const [loading, setLoading] = useState(true);
  const [enrichOpen, setEnrichOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const [filters, setFilters] = useFilters();
  const lookups = useLookups();

  const [searchInput, setSearchInput] = useState(filters.q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the visible search input in sync if the URL changes externally
  // (e.g. preset clicked, filter chip removed, browser back).
  useEffect(() => {
    setSearchInput(filters.q);
  }, [filters.q]);

  const handleSearchChange = useCallback(
    (v: string) => {
      setSearchInput(v);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        // Search is a modifier, not a preset-territory field — don't clear preset.
        setFilters({ q: v, page: 1 });
      }, 300);
    },
    [setFilters],
  );

  // What does a given preset prescribe for the preset-territory fields?
  // Returns only the fields the preset CARES about. The applyPreset machinery
  // resets all other preset-territory fields to defaults; modifier fields
  // (search, oestat, units, dates, etc.) are never touched.
  const getPresetSpec = useCallback(
    (key: Exclude<PresetKey, 'custom'>): Partial<FilterValues> => {
      switch (key) {
        case 'pitch':
          return { peer: 'yes', hasSumDe: true, minScore: 70, showAll: false };
        case 'mahighlights':
          return { maHl: true, showAll: true };
        case 'popsci':
          return { popsci: 'yes' };
        case 'peer':
          return { peer: 'yes' };
        case 'wiss': {
          const ids = (lookups?.publicationTypes ?? [])
            .filter((t) => WISS_TYPE_UIDS.includes(t.webdb_uid))
            .map((t) => t.id);
          return { types: ids };
        }
      }
    },
    [lookups],
  );

  // Type-safe field copy helper: TS can prove K is the same on both sides per call,
  // so we don't need `as Record<string, unknown>` escape hatches anywhere below.
  const setField = <K extends keyof FilterValues>(
    target: Partial<FilterValues>,
    key: K,
    value: FilterValues[K],
  ) => {
    target[key] = value;
  };

  const applyPreset = useCallback(
    (key: PresetKey) => {
      // Toggle off the active preset: reset preset-territory only, preserve modifiers.
      if (filters.preset === key) {
        const reset: Partial<FilterValues> = { preset: 'custom', page: 1 };
        for (const f of PRESET_FIELDS) setField(reset, f, FILTER_DEFAULTS[f]);
        setFilters(reset);
        return;
      }
      if (key === 'custom') return;

      // Switching presets: reset preset-territory to defaults, then apply the
      // new preset's specific values. Modifier fields survive untouched.
      const spec = getPresetSpec(key);
      const patch: Partial<FilterValues> = { preset: key, page: 1 };
      for (const f of PRESET_FIELDS) setField(patch, f, FILTER_DEFAULTS[f]);
      Object.assign(patch, spec);
      setFilters(patch);
    },
    [filters.preset, getPresetSpec, setFilters],
  );

  // Detects when the active preset's territory has been hand-modified
  // (e.g. user toggled `peer: yes` off after picking the Pitch preset).
  // Lets us show a "Modifiziert · Zurücksetzen"-pill for one-click recovery.
  const presetModified = (() => {
    if (filters.preset === 'custom') return false;
    const spec = getPresetSpec(filters.preset);
    for (const f of PRESET_FIELDS) {
      const expected = spec[f] ?? FILTER_DEFAULTS[f];
      const actual = filters[f];
      if (Array.isArray(expected) && Array.isArray(actual)) {
        if (expected.length !== actual.length) return true;
        if (expected.some((v, i) => v !== actual[i])) return true;
      } else if (expected !== actual) {
        return true;
      }
    }
    return false;
  })();

  const resetPresetTerritory = useCallback(() => {
    if (filters.preset === 'custom') return;
    const spec = getPresetSpec(filters.preset);
    const patch: Partial<FilterValues> = { page: 1 };
    for (const f of PRESET_FIELDS) setField(patch, f, FILTER_DEFAULTS[f]);
    Object.assign(patch, spec);
    setFilters(patch);
  }, [filters.preset, getPresetSpec, setFilters]);

  // Resets EVERYTHING (preset + all modifiers) to factory defaults except sort/order.
  // Used by the empty-state escape hatch when filters conflict to zero.
  const resetAllFilters = useCallback(() => {
    setFilters({
      ...FILTER_DEFAULTS,
      sort: filters.sort,
      order: filters.order,
    });
  }, [filters.sort, filters.order, setFilters]);

  // True when any user-set filter — preset or modifier — diverges from defaults.
  const hasAnyActiveFilter = (() => {
    const ignore = new Set(['sort', 'order', 'page']);
    for (const k of Object.keys(FILTER_DEFAULTS) as Array<keyof FilterValues>) {
      if (ignore.has(k)) continue;
      const def = FILTER_DEFAULTS[k];
      const cur = filters[k];
      if (Array.isArray(def) && Array.isArray(cur)) {
        if (cur.length !== def.length) return true;
      } else if (cur !== def) {
        return true;
      }
    }
    return false;
  })();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      p.set('page', String(filters.page));
      p.set('pageSize', String(PAGE_SIZE));
      p.set('sort', filters.sort);
      p.set('order', filters.order);
      if (filters.q) p.set('search', filters.q);
      if (filters.enrich) p.set('enrichment_status', filters.enrich);
      if (filters.analysis) p.set('analysis_status', filters.analysis);
      if (filters.types.length) p.set('pub_type_ids', filters.types.join(','));
      if (filters.units.length) p.set('orgunit_ids', filters.units.join(','));
      if (filters.oestat.length) p.set('oestat6_ids', filters.oestat.join(','));
      if (filters.oestat3.length) p.set('oestat3_domains', filters.oestat3.join(','));
      if (filters.topUnitOnly) p.set('top_level_only', 'true');
      if (filters.peer === 'yes') p.set('peer_reviewed', 'true');
      if (filters.peer === 'no') p.set('peer_reviewed', 'false');
      if (filters.popsci === 'yes') p.set('popular_science', 'true');
      if (filters.popsci === 'no') p.set('popular_science', 'false');
      if (filters.oa === 'yes') p.set('open_access', 'true');
      if (filters.oa === 'no') p.set('open_access', 'false');
      if (filters.hasSumDe) p.set('has_summary_de', 'true');
      if (filters.hasSumEn) p.set('has_summary_en', 'true');
      if (filters.hasPdf) p.set('has_pdf', 'true');
      if (filters.hasDoi) p.set('has_doi', 'true');
      if (filters.maHl) p.set('mahighlight', 'true');
      if (filters.hl) p.set('highlight', 'true');
      if (filters.from) p.set('from', filters.from);
      if (filters.to) p.set('to', filters.to);
      if (filters.minScore > 0) p.set('min_score', String(filters.minScore / 100));
      if (!filters.showAll) p.set('default_eligible', 'true');

      const res = await fetch(`/api/publications?${p}`, { headers: getApiHeaders() });
      const data = await res.json();
      setPublications(data.publications || []);
      setTotal(data.total || 0);
      setHidden(data.total_hidden || 0);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSort = useCallback(
    (column: string) => {
      if (filters.sort === column) {
        setFilters({ order: filters.order === 'asc' ? 'desc' : 'asc', page: 1 });
      } else {
        setFilters({ sort: column, order: 'asc', page: 1 });
      }
    },
    [filters.sort, filters.order, setFilters],
  );

  useKeyboardShortcuts({
    onSearch: () => searchRef.current?.focus(),
    onPrevPage: () => setFilters({ page: Math.max(1, filters.page - 1) }),
    onNextPage: () => {
      const tp = Math.ceil(total / PAGE_SIZE);
      setFilters({ page: Math.min(tp || 1, filters.page + 1) });
    },
  });

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const rangeStart = total > 0 ? (filters.page - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(filters.page * PAGE_SIZE, total);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Publikationen</h1>
        <p className="text-neutral-500" role="status" aria-live="polite">
          {total.toLocaleString('de-AT')} Publikationen
          {!filters.showAll && hidden > 0 && (
            <span className="ml-2 text-neutral-500">
              ({hidden.toLocaleString('de-AT')} ausgeblendet)
            </span>
          )}
        </p>
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative w-full lg:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                ref={searchRef}
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Titel suchen…  (/ oder ⌘K)"
                className="pl-9 h-9"
              />
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
              <PresetBar active={filters.preset} onSelect={applyPreset} />
              {presetModified && (
                <button
                  type="button"
                  onClick={resetPresetTerritory}
                  title="Voreinstellung des Presets wiederherstellen"
                  className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100 transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  Preset modifiziert · zurücksetzen
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <ShowAllToggle
                showAll={filters.showAll}
                onChange={(v) => setFilters({ showAll: v, page: 1 })}
                hiddenCount={hidden}
              />
              <FilterSheet filters={filters} setFilters={setFilters} lookups={lookups} />
            </div>
          </div>

          <ActiveFilters filters={filters} setFilters={setFilters} lookups={lookups} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-base font-medium">
                <Sparkles className="h-4 w-4 text-[#0047bb]" /> Enrichment
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                Metadaten aus CrossRef + OpenAlex anreichern.
              </p>
            </div>
            <Button onClick={() => setEnrichOpen(true)} size="sm">
              Starten
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-base font-medium">
                <Brain className="h-4 w-4 text-[#0047bb]" /> Analyse
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                LLM-Bewertung über OpenRouter.
              </p>
            </div>
            <Button onClick={() => setAnalysisOpen(true)} size="sm">
              Starten
            </Button>
          </CardContent>
        </Card>
      </div>

      <EnrichmentModal open={enrichOpen} onOpenChange={setEnrichOpen} onComplete={fetchData} />
      <AnalysisModal open={analysisOpen} onOpenChange={setAnalysisOpen} onComplete={fetchData} />

      {loading ? (
        <LoadingState label="Lade Publikationen …" />
      ) : publications.length === 0 && hasAnyActiveFilter ? (
        <Card className="border-dashed">
          <CardContent className="px-6 py-10 text-center space-y-4">
            <div>
              <p className="text-base font-medium text-neutral-900">Keine Treffer</p>
              <p className="mt-1 text-sm text-neutral-500">
                Die aktive Filterkombination liefert keine Publikationen.
                {filters.preset !== 'custom' && (
                  <> Aktiver Preset: <strong>{filters.preset}</strong>.</>
                )}
              </p>
              <p className="mt-2 text-xs text-neutral-400">
                Tipp: einzelne Filter über die Chips oben entfernen, oder alles zurücksetzen.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {presetModified && (
                <Button onClick={resetPresetTerritory} variant="outline" size="sm">
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Preset-Modifikationen zurücknehmen
                </Button>
              )}
              <Button onClick={resetAllFilters} variant="outline" size="sm">
                Alle Filter zurücksetzen
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <PublicationTable
          publications={publications}
          showScores
          showEnrichment
          sortBy={filters.sort}
          sortOrder={filters.order}
          onSort={handleSort}
        />
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-neutral-500">
            Zeige {rangeStart}–{rangeEnd} von {total.toLocaleString('de-AT')}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilters({ page: Math.max(1, filters.page - 1) })}
              disabled={filters.page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilters({ page: Math.min(totalPages, filters.page + 1) })}
              disabled={filters.page >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
