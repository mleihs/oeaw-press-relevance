import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getResearcherDetail } from '@/lib/server/researchers/detail';
import { sincePresetToDate } from '@/lib/shared/researchers';
import { BackLink } from './_components/back-link';
import { PersonDetailClient } from './_components/detail-client';

// React.cache dedupes the fetch across generateMetadata + the page render.
const getDetail = cache((id: string) =>
  getResearcherDetail({ id, since: sincePresetToDate(WINDOW) }),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: 'Forscher:in | Story Scout' };
  const detail = await getDetail(id);
  const p = detail?.person;
  if (!p) return { title: 'Forscher:in | Story Scout' };
  return { title: `${p.firstname} ${p.lastname} | Story Scout` };
}

// Per ADR 0009: read-heavy, auth-gated, `since`-parametrised pages opt out
// of ISR for the pilot. Revisit when one of these RSCs sees enough traffic
// to make a cache-window worthwhile.
export const dynamic = 'force-dynamic';

const WINDOW = '12M' as const;
const WINDOW_LABEL = 'letzte 12 Monate';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const detail = await getDetail(id);
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <BackLink />
      <PersonDetailClient detail={detail} windowLabel={WINDOW_LABEL} />
    </div>
  );
}
