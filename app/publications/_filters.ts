import {
  parseAsString,
  parseAsArrayOf,
  parseAsBoolean,
  parseAsStringLiteral,
  parseAsFloat,
  parseAsInteger,
} from 'nuqs';

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

export const filterParsers = {
  q: parseAsString.withDefault(''),
  types: parseAsArrayOf(parseAsString).withDefault([]),
  units: parseAsArrayOf(parseAsString).withDefault([]),
  oestat: parseAsArrayOf(parseAsString).withDefault([]),
  oestat3: parseAsArrayOf(parseAsInteger).withDefault([]),
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
  preset: 'custom',
  showAll: false,
  page: 1,
  sort: 'published_at',
  order: 'desc',
};
