import { Newspaper } from 'lucide-react';
import {
  filtersForTab,
  getPressReleasesStats,
  isTab,
  listPressReleases,
  type Tab,
} from '@/lib/server/press-releases/list';
import { PressReleasesTabsNav } from './_components/tabs-nav';
import { PressReleasesStatsRow } from './_components/stats-row';
import { PressReleasesMainTable } from './_components/main-table';
import { PressReleasesOrphansList } from './_components/orphans-list';

// Carve-out from ADR 0009's force-dynamic default: this page is the only
// read-heavy admin page with no per-user state, no decision toolbar, and no
// query-parameter scope (the `tab` segments are pre-known). 60-second ISR
// cuts p95 sharply while keeping ETL-imported rows visible within a minute.
// All other RSC pages (dashboard, publications/[id], persons/[id]) still
// stay force-dynamic per ADR 0009.
export const revalidate = 60;

export default async function PressReleasesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const activeTab: Tab = isTab(raw) ? raw : 'all';

  // Stats + list fetched in parallel — stats is tab-independent, list is
  // the active tab's payload.
  const [stats, list] = await Promise.all([
    getPressReleasesStats(),
    listPressReleases(filtersForTab(activeTab)),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Newspaper className="h-6 w-6 text-emerald-600" />
          Pressemitteilungen
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Alle ÖAW-Pressemitteilungen mit DOI-Verweis, entweder gematcht gegen die Publications-Datenbank
          oder als externe Referenz angereichert.
        </p>
      </div>

      <PressReleasesStatsRow stats={stats} />
      <PressReleasesTabsNav activeTab={activeTab} stats={stats} />

      {activeTab === 'orphans' ? (
        <PressReleasesOrphansList orphans={list.press_releases} />
      ) : (
        <PressReleasesMainTable
          rows={list.press_releases}
          highlightOrphans={activeTab === 'all'}
        />
      )}
    </div>
  );
}
