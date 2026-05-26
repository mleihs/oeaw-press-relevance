import { notFound } from 'next/navigation';
import { getEventById } from '@/lib/server/events/fetch';
import { EventDetail } from './_components/event-detail';

// Per ADR 0009: decision-state-mutable surfaces stay force-dynamic so the
// reviewer always sees the live state after a flag / decision change.
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const event = await getEventById(id);
  if (!event) notFound();

  return <EventDetail event={event} />;
}
