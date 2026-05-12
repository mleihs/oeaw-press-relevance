import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getResearcherDetail } from '@/lib/server/researchers/detail';
import { sincePresetToDate } from '@/lib/shared/researchers';
import { PersonDetailClient } from './_components/detail-client';

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

  const detail = await getResearcherDetail({ id, since: sincePresetToDate(WINDOW) });
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/researchers"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brand"
      >
        <ChevronLeft className="h-3 w-3" />
        Zurück zur Forscher:innen-Übersicht
      </Link>
      <PersonDetailClient detail={detail} windowLabel={WINDOW_LABEL} />
    </div>
  );
}
