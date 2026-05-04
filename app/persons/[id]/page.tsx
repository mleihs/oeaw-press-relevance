'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getApiHeaders } from '@/lib/settings-store';
import { sincePresetToDate, type ResearcherDetail } from '@/lib/researchers';
import { EmptyState } from '@/components/empty-state';
import { LoadingState } from '@/components/loading-state';
import { PersonHeader } from './_components/person-header';
import dynamic from 'next/dynamic';
import { CoauthorBlock } from './_components/coauthor-block';
import { PubList } from './_components/pub-list';

// Activity chart pulls in recharts (~100kB); lazy-load so first paint of
// the detail header isn't blocked by the chart bundle.
const ActivityChart = dynamic(
  () => import('./_components/activity-chart').then((m) => m.ActivityChart),
  { ssr: false, loading: () => <div className="h-[260px] rounded-lg border bg-white" aria-hidden /> },
);

const WINDOW = '12M' as const;
const WINDOW_LABEL = 'letzte 12 Monate';

export default function PersonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const since = sincePresetToDate(WINDOW);

  const { data: detail, error, isLoading } = useQuery<ResearcherDetail>({
    queryKey: ['person-detail', id, since],
    queryFn: async () => {
      const r = await fetch(`/api/persons/${id}?since=${since}`, { headers: getApiHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      return d;
    },
  });

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
          Fehler beim Laden: {error.message}
        </div>
      </div>
    );
  }

  if (isLoading || !detail) {
    return (
      <div className="space-y-4">
        <BackLink />
        <LoadingState label="Lade Profil …" />
      </div>
    );
  }

  if (!detail.person || !detail.stats) {
    return (
      <div className="space-y-4">
        <BackLink />
        <EmptyState title="Person nicht gefunden." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink />
      <PersonHeader person={detail.person} stats={detail.stats} windowLabel={WINDOW_LABEL} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <ActivityChart data={detail.activity ?? []} />
          <PubList publications={detail.publications ?? []} />
        </div>
        <CoauthorBlock coauthors={detail.coauthors ?? []} />
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/researchers"
      className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-brand"
    >
      <ChevronLeft className="h-3 w-3" />
      Zurück zur Forscher:innen-Übersicht
    </Link>
  );
}
