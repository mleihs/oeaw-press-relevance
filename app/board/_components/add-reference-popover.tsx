'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarDays, Newspaper, Play, Plus, Search } from '@/lib/icons';
import { cn } from '@/lib/shared/utils';
import type { CardReference, ReferenceTargetSuggestion } from '@/lib/shared/board';
import type { ReferenceCreatePayload } from '@/lib/shared/board-schemas';
import { ScoreBadge } from '@/components/score-bar';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  addReferenceApi,
  searchReferenceTargetsApi,
  fetchYoutubeVideosApi,
} from '../_lib/api';

type Tab = 'event' | 'publication' | 'youtube';

const TABS: { key: Tab; label: string; icon: typeof CalendarDays }[] = [
  { key: 'event', label: 'Veranstaltung', icon: CalendarDays },
  { key: 'publication', label: 'Publikation', icon: Newspaper },
  { key: 'youtube', label: 'YouTube', icon: Play },
];

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** „Objekt verknüpfen"-Palette: Quellen-Tabs Veranstaltung · Publikation ·
 *  YouTube. Intern = Live-Suche über Titel (Muster ⌘K-Kartensuche); YouTube =
 *  URL einfügen ODER aus dem Eigenkanal wählen (RSS/Uploads-Playlist). */
export function AddReferencePopover({
  cardId,
  existing,
  onAdded,
}: {
  cardId: string;
  /** Bereits verknüpfte Ziel-IDs (Ausgrauen im Picker statt 409-Rätselraten). */
  existing: CardReference[];
  onAdded: (references: CardReference[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('event');
  const [q, setQ] = useState('');

  const add = useMutation({
    mutationFn: (payload: ReferenceCreatePayload) => addReferenceApi(cardId, payload),
    onSuccess: (references) => {
      onAdded(references);
      setQ('');
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const linkedInternal = new Set(
    existing.filter((r) => r.kind !== 'youtube').map((r) => `${r.kind}:${r.target_id}`),
  );
  const linkedVideoUrls = new Set(
    existing.flatMap((r) => (r.kind === 'youtube' && r.url ? [r.url] : [])),
  );

  const switchTab = (t: Tab) => {
    setTab(t);
    setQ('');
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(''); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-input px-2 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Objekt verknüpfen
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] p-0">
        <div className="flex gap-1 border-b p-1.5">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => switchTab(key)}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors',
                tab === key
                  ? 'bg-brand/10 text-brand'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              tab === 'youtube' ? 'YouTube-URL einfügen oder Titel suchen…' : 'Titel suchen…'
            }
            className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="max-h-[300px] overflow-y-auto p-1.5">
          {tab === 'youtube' ? (
            <YoutubeTab
              q={q}
              pending={add.isPending}
              linkedUrls={linkedVideoUrls}
              onPick={(url) => add.mutate({ kind: 'youtube', url })}
            />
          ) : (
            <InternalTab
              kind={tab}
              q={q}
              pending={add.isPending}
              linked={linkedInternal}
              onPick={(id) => add.mutate({ kind: tab, id })}
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Tabs Veranstaltung/Publikation: Live-Suche, leere Query = jüngste Einträge. */
function InternalTab({
  kind,
  q,
  pending,
  linked,
  onPick,
}: {
  kind: 'event' | 'publication';
  q: string;
  pending: boolean;
  linked: Set<string>;
  onPick: (id: string) => void;
}) {
  const { data: suggestions, isPending: loading } = useQuery({
    queryKey: ['board', 'ref-search', kind, q],
    queryFn: () => searchReferenceTargetsApi(kind, q),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  if (loading && !suggestions) {
    return <EmptyHint text="Sucht…" />;
  }
  if (!suggestions || suggestions.length === 0) {
    return <EmptyHint text={q ? 'Keine Treffer.' : 'Nichts gefunden.'} />;
  }
  return (
    <ul>
      {suggestions.map((s: ReferenceTargetSuggestion) => {
        const isLinked = linked.has(`${kind}:${s.id}`);
        return (
          <li key={s.id}>
            <button
              type="button"
              disabled={isLinked || pending}
              onClick={() => onPick(s.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                isLinked ? 'opacity-45' : 'hover:bg-muted',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-foreground">{s.title}</div>
                <div className="font-mono text-[10.5px] text-muted-foreground">
                  {formatDate(s.date)}
                  {isLinked && ' · bereits verknüpft'}
                </div>
              </div>
              {s.score != null && (
                <ScoreBadge
                  score={s.score}
                  ariaLabel={kind === 'event' ? 'Relevanz-Score' : 'Story Score'}
                />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** YouTube-Tab: eingefügte URL direkt verknüpfen; darunter der Eigenkanal
 *  (Freitext filtert die Uploads). configured=false → nur der URL-Pfad. */
function YoutubeTab({
  q,
  pending,
  linkedUrls,
  onPick,
}: {
  q: string;
  pending: boolean;
  linkedUrls: Set<string>;
  onPick: (url: string) => void;
}) {
  const { data } = useQuery({
    queryKey: ['board', 'yt-videos', q],
    queryFn: () => fetchYoutubeVideosApi(q),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  // Grobe URL-Erkennung fürs Direkt-Verknüpfen; die harte Validierung
  // (parseYoutubeVideoId) macht der Server und antwortet mit 400 + Meldung.
  const looksLikeUrl = /youtu\.be\/|youtube\.com\/|^[\w-]{11}$/.test(q.trim());

  return (
    <div className="space-y-1">
      {looksLikeUrl && (
        <button
          type="button"
          disabled={pending}
          onClick={() => onPick(q.trim())}
          className="flex w-full items-center gap-2 rounded-md bg-brand/10 px-2 py-2 text-left text-[13px] font-medium text-brand transition-colors hover:bg-brand/15"
        >
          <Play className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">„{q.trim().slice(0, 44)}" verknüpfen</span>
        </button>
      )}

      {data && !data.configured && !looksLikeUrl && (
        <EmptyHint text="YouTube-URL einfügen, um ein Video zu verknüpfen. (Eigenkanal-Picker: YOUTUBE_CHANNEL_ID setzen.)" />
      )}

      {data?.configured && data.videos.length === 0 && (
        <EmptyHint text={q ? 'Kein Kanal-Video passt. Alternativ die Video-URL einfügen.' : 'Keine Kanal-Videos gefunden.'} />
      )}

      {data?.configured && data.videos.length > 0 && (
        <>
          <div className="px-2 pt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Eigener Kanal
          </div>
          <ul>
            {data.videos.map((v) => {
              const url = `https://www.youtube.com/watch?v=${v.video_id}`;
              const isLinked = linkedUrls.has(url);
              return (
                <li key={v.video_id}>
                  <button
                    type="button"
                    disabled={isLinked || pending}
                    onClick={() => onPick(url)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors',
                      isLinked ? 'opacity-45' : 'hover:bg-muted',
                    )}
                  >
                    {v.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.thumbnail_url}
                        alt=""
                        loading="lazy"
                        className="h-[34px] w-[60px] shrink-0 rounded object-cover"
                      />
                    ) : (
                      <span className="flex h-[34px] w-[60px] shrink-0 items-center justify-center rounded bg-muted">
                        <Play className="h-4 w-4 text-muted-foreground" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-[12.5px] leading-snug text-foreground">
                        {v.title}
                      </div>
                      <div className="font-mono text-[10.5px] text-muted-foreground">
                        {formatDate(v.published_at)}
                        {isLinked && ' · bereits verknüpft'}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="px-2 py-3 text-center text-[12.5px] text-muted-foreground">{text}</div>;
}
