import { getDashboardData } from '@/lib/server/dashboard/fetch';
import { isDashboardPeriod, type DashboardPeriod } from '@/lib/shared/dashboard';
import { DashboardClient } from './_components/dashboard-client';

// Per ADR 0009: read-heavy admin pages opt out of ISR. The dashboard
// aggregates 5 data sources; the underlying queries are 60s-cached in
// PostgreSQL's `publication_dashboard_stats(...)` function, so a per-render
// fetch is still cheap. Revisit if traffic ever justifies a tuned
// `revalidate=N` window.
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ period?: string | string[] }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.period) ? sp.period[0] : sp.period;
  const period: DashboardPeriod = isDashboardPeriod(raw) ? raw : 'month';

  const data = await getDashboardData(period);

  return <DashboardClient data={data} period={period} />;
}
