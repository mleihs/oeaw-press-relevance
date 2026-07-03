'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Kanban, ArrowUpRight } from '@/lib/icons';
import { QK } from '@/lib/client/query-keys';
import { cardDeepLink } from '@/lib/shared/board';
import { fetchCardsForSourceApi } from '@/lib/client/board-api';
import { Button } from '@/components/ui/button';
import { CreateCardDialog, type CardSource } from './create-card-dialog';

/**
 * „Ins Board"-Trigger für Event-Cockpit und Publikations-Detail. Öffnet den
 * vorbefüllten CreateCardDialog. Existieren bereits Karten aus dieser Quelle,
 * zeigt er zusätzlich einen „Im Board"-Deep-Link (analog zum MeisterTask-Button,
 * aber quer über alle Boards und ohne eigene DB-Spalte — Ableitung aus
 * source_event_id / source_publication_id).
 */
export function CreateCardButton({
  source,
  size = 'sm',
  variant = 'outline',
}: {
  source: CardSource;
  size?: 'sm' | 'default';
  variant?: 'outline' | 'default' | 'ghost';
}) {
  const [open, setOpen] = useState(false);
  const sourceId = source.sourceEventId ?? source.sourcePublicationId;

  const existingQ = useQuery({
    queryKey: QK.cardsForSource(source.kind, sourceId ?? '__none__'),
    queryFn: () =>
      fetchCardsForSourceApi(
        source.kind === 'event'
          ? { eventId: sourceId }
          : { publicationId: sourceId },
      ),
    enabled: !!sourceId,
    staleTime: 30_000,
  });
  const existing = existingQ.data ?? [];

  return (
    <div className="inline-flex items-center gap-2">
      {existing.length > 0 && (
        <Button asChild size={size} variant="ghost" className="text-muted-foreground">
          <Link href={cardDeepLink(existing[0])} title={existing[0].title}>
            Im Board{existing.length > 1 ? ` (${existing.length})` : ''}
            <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      )}
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        <Kanban className="mr-1.5 h-4 w-4" />
        Ins Board
      </Button>
      {open && <CreateCardDialog source={source} onClose={() => setOpen(false)} />}
    </div>
  );
}
