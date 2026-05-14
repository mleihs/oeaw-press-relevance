import { getDashboardData } from '@/lib/server/dashboard/fetch';
import { isDashboardPeriod, type DashboardPeriod } from '@/lib/shared/dashboard';
import { DashboardClient } from './_components/dashboard-client';

// Per ADR 0009: read-heavy admin pages opt out of ISR. The dashboard
// aggregates 5 data sources; the underlying queries are 60s-cached in
// PostgreSQL's `publication_dashboard_stats(...)` function, so a per-render
// fetch is still cheap. Revisit if traffic ever justifies a tuned
// `revalidate=N` window.
export const dynamic = 'force-dynamic';

// Default page-size for the Top-Publikationen list. „Mehr laden" lifts this
// in TOP_PUBS_STEP chunks, capped at TOP_PUBS_MAX so the page stays paint-
// reasonable even after several clicks.
const TOP_PUBS_DEFAULT = 20;
const TOP_PUBS_MAX = 200;

interface PageProps {
  searchParams: Promise<{ period?: string | string[]; topPubs?: string | string[] }>;
}

function parseTopPubsLimit(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = value ? Number.parseInt(value, 10) : NaN;
  if (Number.isNaN(n) || n <= 0) return TOP_PUBS_DEFAULT;
  return Math.min(n, TOP_PUBS_MAX);
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const rawPeriod = Array.isArray(sp.period) ? sp.period[0] : sp.period;
  // Default 'month' (= trailing 2 months per publishedAfter semantics) — wide
  // enough that the Top-N panel can fill its 20 slots in most weeks without
  // over-reaching into stale material.
  const period: DashboardPeriod = isDashboardPeriod(rawPeriod) ? rawPeriod : 'month';
  const topPubsLimit = parseTopPubsLimit(sp.topPubs);

  const data = await getDashboardData(period, topPubsLimit);

  return <DashboardClient data={data} period={period} />;
}
