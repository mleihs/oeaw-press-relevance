import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicationById } from '@/lib/server/publications/fetch';
import { displayTitle } from '@/lib/shared/publication-display';
import { PublicationBreadcrumb } from './_components/breadcrumb';
import { PublicationDetailClient } from './_components/detail-client';

// React.cache dedupes the fetch across generateMetadata + the page render in
// the same request, so the title metadata costs no extra query.
const getPub = cache(getPublicationById);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: 'Publikation | Science Propaganda Ninja' };
  const pub = await getPub(id);
  if (!pub) return { title: 'Publikation | Science Propaganda Ninja' };
  return { title: `${displayTitle(pub.original_title || pub.title, pub.citation)} | Science Propaganda Ninja` };
}

// Per ADR 0009: read-heavy admin pages opt out of ISR. The publication
// detail row is decision-state-mutable (Pitch/Hold/Skip via the toolbar)
// and any stale snapshot would mislead reviewers. Revisit if traffic ever
// justifies a tuned `revalidate=N` window.
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PublicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const pub = await getPub(id);
  if (!pub) notFound();

  const titleForDisplay = displayTitle(pub.original_title || pub.title, pub.citation);

  // DE-vs-EN abstract heuristic: stopwords on the same text the embedding
  // saw. Computed server-side so the client subtree receives a boolean
  // instead of recomputing on every render.
  const abstractText = (
    pub.enriched_abstract || pub.abstract || pub.summary_de || pub.summary_en || ''
  ).toLowerCase();
  const abstractLooksGerman = abstractText.length > 0
    && /\b(und|der|die|das|ist|werden|nicht|sich)\b/.test(abstractText)
    && !/\b(the|and|of|are|with|this|that)\b/.test(abstractText);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PublicationBreadcrumb title={titleForDisplay} />
      <PublicationDetailClient
        pub={pub}
        titleForDisplay={titleForDisplay}
        abstractLooksGerman={abstractLooksGerman}
      />
    </div>
  );
}
