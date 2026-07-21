// Parsers + RSC helpers live in `nuqs/server` — they're isomorphic (the
// client hook in `use-filters.ts` consumes the SAME parser objects). The
// plain `nuqs` entry point carries `'use client'` and breaks when the RSC
// page (force-dynamic) evaluates this module server-side at module load.
import {
  createLoader,
  createSerializer,
  parseAsArrayOf,
  parseAsBoolean,
  parseAsFloat,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs/server';
import { PAGE_SIZE } from './_constants';

export const TRI_STATE = ['any', 'yes', 'no'] as const;
export type TriState = (typeof TRI_STATE)[number];

export const PRESET_KEYS = ['custom', 'pitch', 'mahighlights', 'popsci', 'peer', 'wiss'] as const;
export type PresetKey = (typeof PRESET_KEYS)[number];

/**
 * Filter fields that any preset can control. Switching presets resets these
 * to defaults (then re-applies the new preset's values). Every field NOT in
 * this list — search, oestat, units, dates, has-pdf, etc. — is treated as a
 * user-set modifier and survives every preset switch.
 *
 * This is the Linear/Notion hybrid pattern: presets behave as views,
 * modifiers stack on top of the active view.
 */
export const PRESET_FIELDS = [
  'peer', 'popsci', 'hasSumDe', 'minScore', 'showAll', 'maHl', 'types',
] as const satisfies ReadonlyArray<keyof typeof filterParsers>;

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

/**
 * Bewertungs-Scope. '' = kein Filter, 'fresh' = genau die Menge, die der
 * Bewerten-Knopf erreicht (Kandidaten-View + 60-Tage-Fenster), 'backlog' =
 * der ältere Rückstau, der dem In-Chat-Scoring vorbehalten ist. Serverseitig
 * in lib/server/publications/list.ts über publication_scoring_candidates
 * aufgelöst, damit Kachel-Zahl und Listeninhalt dasselbe meinen.
 */
export const SCORING_SCOPES = ['', 'fresh', 'backlog'] as const;
export type ScoringScope = (typeof SCORING_SCOPES)[number];

export const filterParsers = {
  q: parseAsString.withDefault(''),
  types: parseAsArrayOf(parseAsString).withDefault([]),
  units: parseAsArrayOf(parseAsString).withDefault([]),
  oestat: parseAsArrayOf(parseAsString).withDefault([]),
  oestat3: parseAsArrayOf(parseAsInteger).withDefault([]),
  journal: parseAsString.withDefault(''),
  topUnitOnly: parseAsBoolean.withDefault(true),
  peer: parseAsStringLiteral(TRI_STATE).withDefault('any'),
  popsci: parseAsStringLiteral(TRI_STATE).withDefault('any'),
  oa: parseAsStringLiteral(TRI_STATE).withDefault('any'),
  hasSumDe: parseAsBoolean.withDefault(false),
  hasSumEn: parseAsBoolean.withDefault(false),
  hasPdf: parseAsBoolean.withDefault(false),
  hasDoi: parseAsBoolean.withDefault(false),
  maHl: parseAsBoolean.withDefault(false),
  hl: parseAsBoolean.withDefault(false),
  flagged: parseAsBoolean.withDefault(false),
  pressReleased: parseAsStringLiteral(TRI_STATE).withDefault('any'),
  from: parseAsString.withDefault(''),
  to: parseAsString.withDefault(''),
  minScore: parseAsFloat.withDefault(0),
  enrich: parseAsString.withDefault(''),
  analysis: parseAsString.withDefault(''),
  scoring: parseAsStringLiteral(SCORING_SCOPES).withDefault(''),
  preset: parseAsStringLiteral(PRESET_KEYS).withDefault('custom'),
  showAll: parseAsBoolean.withDefault(false),
  page: parseAsInteger.withDefault(1),
  sort: parseAsString.withDefault('published_at'),
  order: parseAsStringLiteral(SORT_ORDERS).withDefault('desc'),
};

export type FilterValues = {
  [K in keyof typeof filterParsers]: ReturnType<(typeof filterParsers)[K]['parseServerSide']>;
};

export const FILTER_DEFAULTS: FilterValues = {
  q: '',
  types: [],
  units: [],
  oestat: [],
  oestat3: [],
  journal: '',
  topUnitOnly: true,
  peer: 'any',
  popsci: 'any',
  oa: 'any',
  hasSumDe: false,
  hasSumEn: false,
  hasPdf: false,
  hasDoi: false,
  maHl: false,
  hl: false,
  flagged: false,
  pressReleased: 'any',
  from: '',
  to: '',
  minScore: 0,
  enrich: '',
  analysis: '',
  scoring: '',
  preset: 'custom',
  showAll: false,
  page: 1,
  sort: 'published_at',
  order: 'desc',
};

// RSC-side counterpart to `use-filters.ts::useFilters()`. Reads/typed-parses
// the page's searchParams using the SAME parsers the client uses, so URL
// shape is the single source of truth across both rendering modes.
export const loadFilters = createLoader(filterParsers);

// Low-level serializer. nuqs signature is `(base, values)` — we wrap below
// for the common case (merge current filters with a patch).
const serializeRaw = createSerializer(filterParsers, { clearOnDefault: true });

/**
 * Build a URL query string from the current filters plus a patch (e.g. a
 * different page number, or a new sort column). Used by the RSC page for
 * Link hrefs — sort headers, pagination, reset.
 *
 * `clearOnDefault: true` strips default-valued fields, so the resulting URL
 * matches what `use-filters.ts::useQueryStates` (same hook-level option)
 * writes — no client/server URL-shape drift.
 */
export function buildUrl(
  filters: FilterValues,
  patch: Partial<FilterValues> = {},
): string {
  return serializeRaw({ ...filters, ...patch });
}

// Translate FilterValues (UI/URL shape) → listPublications' API shape. The
// two shapes diverge intentionally: nuqs uses compact UI names (`q`, `peer`,
// `showAll`) and richer encodings (tri-state strings, 0-100 score), while
// the API uses descriptive snake-case (`search`, `peer_reviewed`,
// `default_eligible`) with bool/float encodings. `preset` and `topUnitOnly`
// are UI-only (not consumed by the SQL layer). The previous client-side
// builder also forgot to forward `flagged` — fixed here.
export function buildApiParams(filters: FilterValues): URLSearchParams {
  const p = new URLSearchParams();
  p.set('page', String(filters.page));
  p.set('pageSize', String(PAGE_SIZE));
  p.set('sort', filters.sort);
  p.set('order', filters.order);
  if (filters.q) p.set('search', filters.q);
  if (filters.enrich) p.set('enrichment_status', filters.enrich);
  if (filters.analysis) p.set('analysis_status', filters.analysis);
  if (filters.scoring) p.set('scoring_scope', filters.scoring);
  if (filters.types.length) p.set('pub_type_ids', filters.types.join(','));
  if (filters.units.length) p.set('orgunit_ids', filters.units.join(','));
  if (filters.oestat.length) p.set('oestat6_ids', filters.oestat.join(','));
  if (filters.oestat3.length) {
    p.set('oestat3_domains', filters.oestat3.join(','));
  }
  if (filters.journal) p.set('journal', filters.journal);
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
  if (filters.flagged) p.set('flagged', 'true');
  if (filters.from) p.set('from', filters.from);
  if (filters.to) p.set('to', filters.to);
  if (filters.minScore > 0) p.set('min_score', String(filters.minScore / 100));
  if (filters.pressReleased === 'yes') p.set('press_released', 'true');
  if (filters.pressReleased === 'no') p.set('press_released', 'false');
  if (!filters.showAll) p.set('default_eligible', 'true');
  return p;
}

// Field-set helper used by preset-application code. Type-safe so callers
// don't reach for `as Record<string, unknown>` escape hatches.
export function setField<K extends keyof FilterValues>(
  target: Partial<FilterValues>,
  key: K,
  value: FilterValues[K],
): void {
  target[key] = value;
}

// Detects when a filter-set diverges from any non-ignored default. Used by
// the empty-state condition + ActiveFilters reset chip.
const ALWAYS_ACTIVE_DEFAULTS = new Set<keyof FilterValues>(['sort', 'order', 'page']);
export function hasAnyActiveFilter(filters: FilterValues): boolean {
  for (const k of Object.keys(FILTER_DEFAULTS) as Array<keyof FilterValues>) {
    if (ALWAYS_ACTIVE_DEFAULTS.has(k)) continue;
    const def = FILTER_DEFAULTS[k];
    const cur = filters[k];
    if (Array.isArray(def) && Array.isArray(cur)) {
      if (cur.length !== def.length) return true;
    } else if (cur !== def) {
      return true;
    }
  }
  return false;
}
