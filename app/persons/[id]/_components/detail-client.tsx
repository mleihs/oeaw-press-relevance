'use client';

import dynamic from 'next/dynamic';
import { PersonHeader } from './person-header';
import { CoauthorBlock } from './coauthor-block';
import { PubList } from './pub-list';
import type { ResearcherDetail } from '@/lib/shared/researchers';

// Activity chart pulls in recharts (~100kB); lazy-load so first paint of
// the detail header isn't blocked by the chart bundle. The dynamic() call
// needs to live in a `'use client'` boundary, so it stays here rather than
// in the RSC page.
const ActivityChart = dynamic(
  () => import('./activity-chart').then((m) => m.ActivityChart),
  { ssr: false, loading: () => <div className="h-[260px] rounded-lg border bg-card" aria-hidden /> },
);

interface PersonDetailClientProps {
  detail: ResearcherDetail;
  windowLabel: string;
}

export function PersonDetailClient({ detail, windowLabel }: PersonDetailClientProps) {
  // RSC handed us a row whose `person` and `stats` are non-null (page-side
  // notFound() guards both). Narrow once so children stay non-nullable.
  if (!detail.person || !detail.stats) return null;

  return (
    <div className="space-y-6">
      <PersonHeader person={detail.person} stats={detail.stats} windowLabel={windowLabel} />

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
