'use client';

import { useEffect, useState, useRef } from 'react';
import { useQueryStates } from 'nuqs';
import { filterParsers } from '../_filters';
import { sincePresetToDate, defaultMinValueFor, type TopResearcherRow, type DistributionPoint } from '@/lib/researchers';
import { getApiHeaders } from '@/lib/settings-store';

export function useLeaderboard() {
  const [filters] = useQueryStates(filterParsers, { shallow: false });
  const [rows, setRows] = useState<TopResearcherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
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
      limit: '50',
    });
    if (filters.oestat3.length) params.set('oestat3_ids', filters.oestat3.join(','));

    const id = ++reqId.current;
    setLoading(true);
    fetch(`/api/researchers/top?${params}`, { headers: getApiHeaders() })
      .then((r) => r.json())
      .then((d) => {
        if (id !== reqId.current) return;
        if (d.error) {
          setError(d.error);
          setRows([]);
        } else {
          setError(null);
          setRows(d.rows ?? []);
        }
      })
      .catch((e) => {
        if (id !== reqId.current) return;
        setError(e.message ?? 'Fetch failed');
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
  }, [
    filters.since, filters.metric, filters.scope,
    filters.external, filters.deceased, filters.memberOnly,
    filters.includeIta, filters.includeOutreach, filters.oestat3,
  ]);

  return { rows, loading, error };
}

export function useDistribution() {
  const [filters] = useQueryStates(filterParsers, { shallow: false });
  const [points, setPoints] = useState<DistributionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
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
      limit: '500',
    });
    if (filters.oestat3.length) params.set('oestat3_ids', filters.oestat3.join(','));

    const id = ++reqId.current;
    setLoading(true);
    fetch(`/api/researchers/distribution?${params}`, { headers: getApiHeaders() })
      .then((r) => r.json())
      .then((d) => {
        if (id !== reqId.current) return;
        if (d.error) {
          setError(d.error);
          setPoints([]);
        } else {
          setError(null);
          setPoints(d.points ?? []);
        }
      })
      .catch((e) => {
        if (id !== reqId.current) return;
        setError(e.message ?? 'Fetch failed');
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
  }, [
    filters.since, filters.metric, filters.scope,
    filters.external, filters.deceased, filters.memberOnly,
    filters.includeIta, filters.includeOutreach, filters.oestat3,
  ]);

  return { points, loading, error };
}
