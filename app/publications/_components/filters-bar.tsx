'use client';

import { useCallback, useRef, useState } from 'react';
import {
  Crown,
  Newspaper,
  Pin,
  RotateCcw,
  Rows,
  Search,
  TrendingUp,
  type LucideIcon,
} from '@/lib/icons';
import { Input } from '@/components/ui/input';
import { InfoBubble } from '@/components/info-bubble';
import { cn } from '@/lib/shared/utils';
import { useKeyboardShortcuts } from '@/lib/client/hooks/use-keyboard-shortcuts';
import { useFilters } from '../use-filters';
import {
  FILTER_DEFAULTS,
  PRESET_FIELDS,
  hidesUnscored,
  setField,
  type FilterValues,
  type PresetKey,
} from '../_filters';
import { PAGE_SIZE, WISS_TYPE_UIDS } from '../_constants';
import { ActiveFilters } from './active-filters';
import { FilterSheet } from './filter-sheet';
import { PresetBar } from './preset-bar';
import { ShowAllToggle } from './show-all-toggle';
import { SortDropdown } from './sort-dropdown';
import { UnscoredFilterPill, unscoredPillVisible } from './unscored-filter-pill';
import { useLookups } from './use-lookups';

interface Props {
  total: number;
  hidden: number;
  /** N/A rows hidden by the default score filter (total_hidden_unscored). */
  hiddenUnscored: number;
}

// Mobile-Schnellfilter (Mock Board-Mobile.dc.html Z. 378–384): Ein-Feld-Filter
// als single-select Chip-Reihe — kein zweites Preset-System, jeder Chip setzt
// genau ein bestehendes URL-Filterfeld. Abweichung vom Mock (vetobar):
// „Flagship" → „Eigen-Highlights" (maHl) — Flagship ist ein reines
// Journal-Tier-Konzept ohne Listen-Filter im Backend.
type QuickKey = 'all' | 'high' | 'mahl' | 'pm' | 'flagged';
const QUICK_CHIPS: Array<{ key: QuickKey; label: string; Icon: LucideIcon }> = [
  { key: 'all', label: 'Alle', Icon: Rows },
  { key: 'high', label: 'Hohes Potenzial', Icon: TrendingUp },
  { key: 'mahl', label: 'Eigen-Highlights', Icon: Crown },
  { key: 'pm', label: 'Mit PM', Icon: Newspaper },
  { key: 'flagged', label: 'Geflaggt', Icon: Pin },
];

// Single client island wrapping the filter UI: nuqs state + search debounce +
// preset state machine + keyboard shortcuts + the existing sub-components
// (PresetBar, ShowAllToggle, FilterSheet, ActiveFilters, UnscoredFilterPill). The page (RSC)
// renders this between header and pipeline-actions; data fetching happens
// server-side based on the URL the user manipulates here.
export function FiltersBar({ total, hidden, hiddenUnscored }: Props) {
  const [filters, setFilters] = useFilters();
  const lookups = useLookups();

  const hidingUnscored = hidesUnscored(filters);
  const pillVisible = unscoredPillVisible({
    hiding: hidingUnscored,
    showNa: filters.showNa,
    hiddenCount: hiddenUnscored,
  });
  const setShowNa = useCallback(
    (showNa: boolean) => setFilters({ showNa, page: 1 }),
    [setFilters],
  );

  const [searchInput, setSearchInput] = useState(filters.q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Keep the visible search input in sync if the URL changes externally
  // (preset clicked, chip removed, browser back). React's "adjust state
  // during render" pattern: detect the external change by comparing the
  // previous `filters.q` and reset synchronously — no effect, no cascade.
  const [prevQ, setPrevQ] = useState(filters.q);
  if (filters.q !== prevQ) {
    setPrevQ(filters.q);
    setSearchInput(filters.q);
  }

  const handleSearchChange = useCallback(
    (v: string) => {
      setSearchInput(v);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        // Search is a modifier, not preset-territory — don't clear the preset.
        setFilters({ q: v, page: 1 });
      }, 300);
    },
    [setFilters],
  );

  // What does a given preset prescribe for the preset-territory fields?
  // Returns only the fields the preset CARES about. The applyPreset machinery
  // resets all other preset-territory fields to defaults; modifier fields
  // (search, oestat, units, dates, etc.) are never touched.
  // showNa: true where most of the set has no score, so the default N/A filter
  // would gut the view (prod 2026-10-23: 81 of 135 Eigen-Highlights, 992 of
  // 1.244 Popular-Science-Pubs ohne Score).
  const getPresetSpec = useCallback(
    (key: Exclude<PresetKey, 'custom'>): Partial<FilterValues> => {
      switch (key) {
        case 'pitch':
          return { peer: 'yes', hasSumDe: true, minScore: 70, showAll: false };
        case 'mahighlights':
          return { maHl: true, showAll: true, showNa: true };
        case 'popsci':
          return { popsci: 'yes', showNa: true };
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
  // Drives the "Modifiziert · zurücksetzen" pill for one-click recovery.
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

  useKeyboardShortcuts({
    onSearch: () => searchRef.current?.focus(),
    onPrevPage: () => setFilters({ page: Math.max(1, filters.page - 1) }),
    onNextPage: () => {
      const tp = Math.ceil(total / PAGE_SIZE);
      setFilters({ page: Math.min(tp || 1, filters.page + 1) });
    },
  });

  // Welcher Schnellfilter-Chip ist aktiv? Reine Ableitung aus den URL-Feldern
  // (Prioritätskette), damit auch via Filter-Sheet/Desktop gesetzte Werte den
  // richtigen Chip markieren. Kein eigener State.
  const quickActive: QuickKey = filters.flagged
    ? 'flagged'
    : filters.pressReleased === 'yes'
      ? 'pm'
      : filters.maHl
        ? 'mahl'
        : filters.minScore >= 70
          ? 'high'
          : 'all';

  // Single-select wie im Mock: Chip-Wechsel setzt das Preset-Territorium +
  // die Quick-Felder zurück und wendet dann genau das eine Feld an. Modifier
  // (Suche, Institute, Datum, …) überleben — dieselbe Semantik wie applyPreset.
  const applyQuick = useCallback(
    (key: QuickKey) => {
      const patch: Partial<FilterValues> = {
        page: 1,
        preset: 'custom',
        flagged: false,
        pressReleased: 'any',
      };
      for (const f of PRESET_FIELDS) setField(patch, f, FILTER_DEFAULTS[f]);
      if (key === 'high') patch.minScore = 70;
      if (key === 'mahl') {
        // Wie das Desktop-Preset „Eigen-Highlights": ohne showAll und showNa
        // wären viele kuratierte Highlights (nicht default-eligible oder ohne
        // Score) unsichtbar.
        patch.maHl = true;
        patch.showAll = true;
        patch.showNa = true;
      }
      if (key === 'pm') {
        // Die PM-Liste soll vollständig sein, auch wo noch kein Score existiert.
        patch.pressReleased = 'yes';
        patch.showNa = true;
      }
      if (key === 'flagged') patch.flagged = true;
      setFilters(patch);
    },
    [setFilters],
  );

  return (
    <div className="space-y-3">
      {/* ── Mobile-Layer (< md) — Mock Z. 373–384: Suche + Schnellfilter-Chips.
          Show-All-Toggle/Filter-Sheet/Active-Filters bleiben Desktop (Mock hat
          sie nicht; via Chips gesetzte Filter sind am Chip selbst sichtbar). */}
      <div className="space-y-2.5 md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-10 flex-1 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-[11px]">
            <Search aria-hidden className="h-4 w-4 shrink-0 text-ink-muted" />
            <label htmlFor="publications-search-mobile" className="sr-only">
              Publikationen suchen
            </label>
            <input
              id="publications-search-mobile"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Titel, Autor:in, Zusammenfassung…"
              className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
            />
          </div>
          <SortDropdown sort={filters.sort} order={filters.order} setFilters={setFilters} compact />
        </div>
        {/* x-scroll bis an den Viewport-Rand (main hat px-4) — Muster wie die
            Perioden-Chips des Mobile-Dashboards (M3). */}
        <div
          role="group"
          aria-label="Schnellfilter"
          className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex min-w-max gap-[7px]">
            {QUICK_CHIPS.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                aria-pressed={quickActive === key}
                onClick={() => applyQuick(key)}
                className={cn(
                  'inline-flex h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-[13px] text-xs font-semibold transition-colors',
                  quickActive === key
                    ? 'border-brand bg-brand-50 text-brand'
                    : 'border-line-strong bg-surface text-ink-subtle',
                )}
              >
                <Icon aria-hidden className="h-[13px] w-[13px]" />
                {label}
              </button>
            ))}
          </div>
        </div>
        {/* Der N/A-Filter wirkt auch mobil per Default, also muss er auch hier
            sichtbar sein. Volle Breite, weil der Text auf schmalen Screens
            umbricht und eine zweizeilige Pillenform schief aussähe. */}
        {pillVisible && (
          <UnscoredFilterPill
            hiding={hidingUnscored}
            hiddenCount={hiddenUnscored}
            onChange={setShowNa}
            className="flex w-full rounded-[10px] py-1.5"
          />
        )}
      </div>

      {/* ── Desktop-Layer (≥ md) — unverändert ── */}
      <div className="hidden md:flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative w-full lg:max-w-xs inline-flex items-center gap-1">
            <div className="relative flex-1">
              <Search aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
              <label htmlFor="publications-search" className="sr-only">
                Publikationen suchen
              </label>
              <Input
                ref={searchRef}
                id="publications-search"
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Titel suchen…  (/)"
                className="pl-9 h-9"
              />
            </div>
            <InfoBubble id="search_scope" size="sm" />
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
            <PresetBar active={filters.preset} onSelect={applyPreset} />
            {presetModified && (
              <button
                type="button"
                onClick={resetPresetTerritory}
                title="Voreinstellung des Presets wiederherstellen"
                className="inline-flex items-center gap-1 rounded-full border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/[0.08] px-2.5 py-1 text-2xs font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/15 transition-colors"
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
            <SortDropdown sort={filters.sort} order={filters.order} setFilters={setFilters} />
            <FilterSheet filters={filters} setFilters={setFilters} lookups={lookups} />
          </div>
        </div>

      <div className="hidden md:block">
        <ActiveFilters
          filters={filters}
          setFilters={setFilters}
          lookups={lookups}
          leading={
            pillVisible ? (
              <UnscoredFilterPill
                hiding={hidingUnscored}
                hiddenCount={hiddenUnscored}
                onChange={setShowNa}
              />
            ) : null
          }
        />
      </div>
    </div>
  );
}
