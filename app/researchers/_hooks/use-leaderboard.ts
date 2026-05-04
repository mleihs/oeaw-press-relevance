'use client';

import { useQueryStates } from 'nuqs';
import { filterParsers } from '../_filters';
import { sincePresetToDate, defaultMinValueFor, type TopResearcherRow, type DistributionPoint } from '@/lib/researchers';
import { useApiQuery } from '@/lib/use-api-query';

function buildResearcherParams(
  filters: ReturnType<typeof useQueryStates<typeof filterParsers>>[0],
  limit: number,
) {
  const since = sincePresetToDate(filters.since);
  const params = new URLSearchParams({
    since,
    metric: filters.metric,
    authorship_scope: filters.scope,
    include_external: String(filters.external),
    include_deceased: String(filters.deceased),
    member_only: String(filters.memberOnly),
    exclude_ita: String(!filters.includeIta),
    exclude_outreach: String(!filters.includeOutreach),
    min_value: String(defaultMinValueFor(filters.metric)),
    limit: String(limit),
  });
  if (filters.oestat3.length) params.set('oestat3_ids', filters.oestat3.join(','));
  return params;
}

export function useLeaderboard() {
  const [filters] = useQueryStates(filterParsers, { shallow: false });
  const params = buildResearcherParams(filters, 50);
  const { data, error, isLoading } = useApiQuery<{ rows?: TopResearcherRow[] }>(
    ['researchers-top', params.toString()],
    `/api/researchers/top?${params}`,
  );
  return {
    rows: data?.rows ?? [],
    loading: isLoading,
    error: error?.message ?? null,
  };
}

export function useDistribution() {
  const [filters] = useQueryStates(filterParsers, { shallow: false });
  const params = buildResearcherParams(filters, 500);
  const { data, error, isLoading } = useApiQuery<{ points?: DistributionPoint[] }>(
    ['researchers-distribution', params.toString()],
    `/api/researchers/distribution?${params}`,
  );
  return {
    points: data?.points ?? [],
    loading: isLoading,
    error: error?.message ?? null,
  };
}
