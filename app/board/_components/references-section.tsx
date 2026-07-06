'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import NextLink from 'next/link';
import {
  CalendarDays,
  Layers,
  Newspaper,
  Play,
  RefreshCw,
  SquareArrowOutUpRight,
  Trash2,
} from '@/lib/icons';
import { cn } from '@/lib/shared/utils';
import type { CardDetail, CardReference } from '@/lib/shared/board';
import { formatVideoDuration } from '@/lib/shared/board';
import { formatCompact } from '@/lib/shared/format-compact';
import { ScoreBadge } from '@/components/score-bar';
import { removeReferenceApi, refreshReferenceApi, objectThumbnailUrl } from '../_lib/api';
import { AddReferencePopover } from './add-reference-popover';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}


/** Smart-Objekte der Karte (BOARD_SMART_OBJECTS.md): Events/Publikationen als
 *  Live-Chips mit Score, YouTube-Videos als Thumbnail-Kacheln mit Dauer/Views.
 *  Eine vereinheitlichte Liste nach created_at; Hinzufügen über die Palette. */
export function ReferencesSection({
  card,
  onReferences,
}: {
  card: CardDetail;
  /** Mutationen antworten mit der vollen Referenzliste — der Parent schreibt
   *  sie in den Card-Cache und invalidiert (Activity-Strand). */
  onReferences: (references: CardReference[]) => void;
}) {
  const remove = useMutation({
    mutationFn: (refId: string) => removeReferenceApi(card.id, refId),
    onSuccess: onReferences,
    onError: (e: Error) => toast.error(e.message),
  });
  const refresh = useMutation({
    mutationFn: (refId: string) => refreshReferenceApi(card.id, refId),
    onSuccess: (refs) => {
      onReferences(refs);
      toast.success('Video-Daten aktualisiert.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">Verknüpfte Objekte</span>
        {card.references.length > 0 && (
          <span className="font-mono text-2xs text-muted-foreground">
            {card.references.length}
          </span>
        )}
      </div>

      {card.references.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {card.references.map((ref) => (
            <li
              key={ref.id}
              className="group flex items-center gap-2.5 rounded-md border px-2.5 py-1.5"
              style={{ backgroundColor: 'var(--board-chip-bg)' }}
            >
              {ref.kind === 'youtube' ? (
                <YoutubeRow reference={ref} onRefresh={() => refresh.mutate(ref.id)} refreshing={refresh.isPending} />
              ) : (
                <InternalRow reference={ref} />
              )}
              <button
                type="button"
                onClick={() => remove.mutate(ref.id)}
                disabled={remove.isPending}
                className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100"
                aria-label="Verknüpfung entfernen"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <AddReferencePopover cardId={card.id} existing={card.references} onAdded={onReferences} />
    </div>
  );
}

/** Event-/Publikations-Zeile: typisiertes Icon, Titel als interner Deep-Link,
 *  Datum + Live-Score (Mono-Quadrat, toolkit-weit). */
function InternalRow({ reference }: { reference: Extract<CardReference, { kind: 'event' | 'publication' }> }) {
  const isEvent = reference.kind === 'event';
  const Icon = isEvent ? CalendarDays : Newspaper;
  const href = isEvent ? `/events/${reference.target_id}` : `/publications/${reference.target_id}`;
  const date = isEvent ? reference.event_at : reference.published_at;
  const score = isEvent ? reference.score : reference.press_score;
  return (
    <>
      <span
        className={cn(
          'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md',
          isEvent ? 'bg-brand/10 text-brand' : 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <NextLink
          href={href}
          className="block truncate text-sm font-medium text-foreground hover:text-brand hover:underline"
        >
          {reference.title}
        </NextLink>
        <div className="font-mono text-2xs text-muted-foreground">
          {isEvent ? 'Veranstaltung' : 'Publikation'}
          {date && ` · ${formatDate(date)}`}
          {isEvent && reference.decision === 'pitch' && ' · gepitcht'}
        </div>
      </div>
      {score != null && (
        <ScoreBadge score={score} ariaLabel={isEvent ? 'Relevanz-Score' : 'Story Score'} />
      )}
    </>
  );
}

/** YouTube-Zeile: Thumbnail (same-origin Proxy) mit Dauer-Badge, Titel als
 *  externer Link, Kanal + Views + Veröffentlichungsdatum, Refresh-Aktion. */
function YoutubeRow({
  reference,
  onRefresh,
  refreshing,
}: {
  reference: Extract<CardReference, { kind: 'youtube' }>;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const s = reference.snapshot;
  const meta = [
    s.channel_title,
    s.view_count != null ? `${formatCompact(s.view_count)} Aufrufe` : null,
    s.published_at ? formatDate(s.published_at) : null,
  ].filter(Boolean);
  return (
    <>
      <span className="relative block h-[46px] w-[74px] shrink-0 overflow-hidden rounded-md bg-muted">
        {s.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={objectThumbnailUrl(reference.target_id)}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <Play className="h-4 w-4 text-muted-foreground" />
          </span>
        )}
        {s.duration_seconds != null && (
          <span className="absolute bottom-0.5 right-0.5 rounded bg-black/75 px-1 font-mono text-3xs font-medium leading-[15px] text-white">
            {formatVideoDuration(s.duration_seconds)}
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        {reference.url ? (
          <a
            href={reference.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-sm font-medium text-foreground hover:text-brand hover:underline"
          >
            {s.title}
          </a>
        ) : (
          <span className="block truncate text-sm font-medium text-foreground">{s.title}</span>
        )}
        <div className="truncate font-mono text-2xs text-muted-foreground">
          {['YouTube', ...meta].join(' · ')}
        </div>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-brand focus-visible:opacity-100 group-hover:opacity-100"
        aria-label="Video-Daten aktualisieren"
        title="Titel/Dauer/Views neu von YouTube ziehen"
      >
        <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
      </button>
      {reference.url && (
        <a
          href={reference.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded p-1 text-muted-foreground hover:text-brand"
          aria-label="Auf YouTube öffnen"
        >
          <SquareArrowOutUpRight className="h-3.5 w-3.5" />
        </a>
      )}
    </>
  );
}
