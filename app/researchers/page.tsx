'use client';

import { useQueryStates } from 'nuqs';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Users } from 'lucide-react';
import { filterParsers } from './_filters';
import { FiltersBar } from './_components/filters-bar';
import { SpotlightPodium } from './_components/spotlight-podium';
import { LeaderboardTable } from './_components/leaderboard-table';
import { BeeswarmView } from './_components/beeswarm-view';
import { useLeaderboard, useDistribution } from './_hooks/use-leaderboard';

export default function ResearchersPage() {
  const [filters, setFilters] = useQueryStates(filterParsers, { shallow: false });
  const { rows, loading: loadingTop } = useLeaderboard();
  const { points, loading: loadingDist } = useDistribution();

  return (
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-light tracking-tight">
              <Users className="h-5 w-5 text-brand" />
              Forscher:innen
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Wer hat im gewählten Zeitraum presserelevante Publikationen produziert?
            </p>
          </div>
        </header>

        <FiltersBar />

        <SpotlightPodium rows={rows} metric={filters.metric} />

        <Tabs
          value={filters.view}
          onValueChange={(v) => setFilters({ view: v as 'leaderboard' | 'distribution' })}
        >
          <TabsList>
            <TabsTrigger value="leaderboard">Rangliste</TabsTrigger>
            <TabsTrigger value="distribution">Verteilung</TabsTrigger>
          </TabsList>

          <TabsContent value="leaderboard" className="mt-4">
            <LeaderboardTable rows={rows} loading={loadingTop} />
          </TabsContent>

          <TabsContent value="distribution" className="mt-4">
            <BeeswarmView points={points} loading={loadingDist} metric={filters.metric} />
          </TabsContent>
        </Tabs>
      </div>
  );
}
