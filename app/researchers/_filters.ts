import {
  parseAsString,
  parseAsArrayOf,
  parseAsBoolean,
  parseAsStringLiteral,
} from 'nuqs';
import { SINCE_PRESETS, type SincePreset } from '@/lib/researchers';

export const METRIC_KEYS = ['count_high', 'sum_score', 'avg_score', 'weighted_avg', 'pubs_total'] as const;
export const SCOPE_KEYS = ['all', 'lead'] as const;

const SINCE_KEYS = SINCE_PRESETS.map((p) => p.value) as readonly SincePreset[];

export const filterParsers = {
  since: parseAsStringLiteral(SINCE_KEYS).withDefault('12M' as SincePreset),
  metric: parseAsStringLiteral(METRIC_KEYS).withDefault('count_high'),
  scope: parseAsStringLiteral(SCOPE_KEYS).withDefault('all'),
  oestat3: parseAsArrayOf(parseAsString).withDefault([]),
  external: parseAsBoolean.withDefault(false),
  deceased: parseAsBoolean.withDefault(false),
  memberOnly: parseAsBoolean.withDefault(false),
  includeIta: parseAsBoolean.withDefault(false),
  includeOutreach: parseAsBoolean.withDefault(false),
  view: parseAsStringLiteral(['leaderboard', 'distribution'] as const).withDefault('leaderboard'),
};

export type ResearcherFilters = {
  [K in keyof typeof filterParsers]: ReturnType<(typeof filterParsers)[K]['parseServerSide']>;
};
