'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getApiHeaders } from '@/lib/settings-store';
import { sincePresetToDate, type ResearcherDetail } from '@/lib/researchers';
import { PersonHeader } from './_components/person-header';
import { ActivityChart } from './_components/activity-chart';
import { CoauthorBlock } from './_components/coauthor-block';
import { PubList } from './_components/pub-list';

const WINDOW = '12M' as const;
const WINDOW_LABEL = 'letzte 12 Monate';

export default function PersonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<ResearcherDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const since = sincePresetToDate(WINDOW);
    fetch(`/api/persons/${id}?since=${since}`, { headers: getApiHeaders() })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
        return d;
      })
      .then((d) => setDetail(d))
      .catch((e) => setError(e.message ?? 'Fetch failed'));
  }, [id]);

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
          Fehler beim Laden: {error}
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-lg border bg-white p-12 text-center text-sm text-neutral-400">
          Lade Profil …
        </div>
      </div>
    );
  }

  if (!detail.person || !detail.stats) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-lg border bg-white p-12 text-center text-sm text-neutral-400">
          Person nicht gefunden.
        </div>
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
      className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-[#0047bb]"
    >
      <ChevronLeft className="h-3 w-3" />
      Zurück zur Forscher:innen-Übersicht
    </Link>
  );
}
