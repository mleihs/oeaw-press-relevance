import { getDashboardData } from '@/lib/server/dashboard/fetch';
import { getSocialDashboardData } from '@/lib/server/social/dashboard';
import { getBoardDashboardCards } from '@/lib/server/board';
import { getScoringStatus } from '@/lib/server/ingest/status';
import { getCurrentUser } from '@/lib/server/auth/require';
import {
  DASHBOARD_SOCIAL_ENABLED,
  isDashboardPeriod,
  parseSortBy,
  parseTopPubsLimit,
  type DashboardPeriod,
} from '@/lib/shared/dashboard';
import { DashboardClient } from './_components/dashboard-client';

// Per ADR 0009: read-heavy admin pages opt out of ISR so per-request data (the
// Top-N panel for the selected period, live flag/orphan counts) is always
// current. The expensive, param-independent aggregates (stats, scatter, period
// counts, WebDB-as-of) are wrapped in `unstable_cache(…, { revalidate: 60 })`
// inside `getDashboardData`, so their full-table scans run at most once per 60s
// under traffic rather than on every render.
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    period?: string | string[];
    topPubs?: string | string[];
    sortBy?: string | string[];
  }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const rawPeriod = Array.isArray(sp.period) ? sp.period[0] : sp.period;
  // Default 'month' (= trailing 2 months per publishedAfter semantics) — wide
  // enough that the Top-N panel can fill its 20 slots in most weeks without
  // over-reaching into stale material.
  const period: DashboardPeriod = isDashboardPeriod(rawPeriod) ? rawPeriod : 'month';
  const topPubsLimit = parseTopPubsLimit(sp.topPubs);
  const sortBy = parseSortBy(sp.sortBy);

  // Board-Kachel nur für angemeldete Nutzer (Board ist auth-gated). Bewusst
  // NICHT in getDashboardData: das Gate hängt an getCurrentUser() (liest
  // Cookies → im unstable_cache-Wrapper von getDashboardData nicht erlaubt) und
  // die Karten sollen pro Request frisch sein. Der Zweig läuft parallel zu
  // den Aggregaten (unabhängig — sequenziell kostete er nur Latenz).
  // scoringStatus bewusst UNGECACHT + auf Page-Ebene (nicht in getDashboardData):
  // nach einem „Bewerten"-Lauf löst das Modal router.refresh() aus, und die
  // Kachel muss sofort die gesunkene Zahl zeigen. Läuft parallel zu den
  // Aggregaten (unabhängig).
  const [data, socialData, boardCards, scoringStatus] = await Promise.all([
    getDashboardData(period, topPubsLimit, sortBy),
    // Feature-Flag (lib/shared/dashboard.ts): einstweilen aus → keine Abfrage,
    // Kachel wird nirgends gerendert. Wiedereinschalten = Flag auf true.
    DASHBOARD_SOCIAL_ENABLED ? getSocialDashboardData() : Promise.resolve(null),
    getCurrentUser().then((user) => (user ? getBoardDashboardCards() : null)),
    getScoringStatus(),
  ]);

  return (
    <DashboardClient
      data={data}
      period={period}
      sortBy={sortBy}
      boardCards={boardCards}
      socialData={socialData}
      scoringStatus={scoringStatus}
    />
  );
}
