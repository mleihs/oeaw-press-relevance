'use client';

import { useQuery } from '@tanstack/react-query';
import { useQueryStates } from 'nuqs';
import { filterParsers } from '../_filters';
import { sincePresetToDate, defaultMinValueFor, type TopResearcherRow, type DistributionPoint } from '@/lib/researchers';
import { getApiHeaders } from '@/lib/settings-store';

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

  const { data, error, isLoading } = useQuery<{ rows?: TopResearcherRow[]; error?: string }>({
    queryKey: ['researchers-top', params.toString()],
    queryFn: async () => {
      const r = await fetch(`/api/researchers/top?${params}`, { headers: getApiHeaders() });
      return r.json();
    },
  });

  const apiError = data?.error ?? null;
  const message = error instanceof Error ? error.message : null;
  return {
    rows: apiError ? [] : data?.rows ?? [],
    loading: isLoading,
    error: apiError ?? message,
  };
}

export function useDistribution() {
  const [filters] = useQueryStates(filterParsers, { shallow: false });
  const params = buildResearcherParams(filters, 500);

  const { data, error, isLoading } = useQuery<{ points?: DistributionPoint[]; error?: string }>({
    queryKey: ['researchers-distribution', params.toString()],
    queryFn: async () => {
      const r = await fetch(`/api/researchers/distribution?${params}`, { headers: getApiHeaders() });
      return r.json();
    },
  });

  const apiError = data?.error ?? null;
  const message = error instanceof Error ? error.message : null;
  return {
    points: apiError ? [] : data?.points ?? [],
    loading: isLoading,
    error: apiError ?? message,
  };
}
