'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search, X } from '@/lib/icons';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  EVENTS_BAND_VALUES,
  EVENTS_BAND_LABELS,
  type EventsBand,
} from '@/lib/shared/events-filter';

// Radix Select reserves '' for "no selection", so the "Alle" entries use a
// sentinel that maps back to deleting the URL param.
const ALL = '__all__';

/**
 * Light filter bar for the events list (item F): title/teaser search, a
 * score-band quick filter, and an institute facet. URL-driven like
 * MainNewsToggle — each control rewrites only its own param and preserves the
 * rest (tab, main, view, date, sort), so filters compose with everything and
 * stay shareable/reload-safe. The search push is debounced so a keystroke
 * doesn't fire an RSC fetch per character.
 */
export function EventsFilterBar({
  q,
  band,
  institute,
  institutes,
}: {
  q: string;
  band: EventsBand | null;
  institute: string | null;
  institutes: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Local mirror so typing is instant; the URL is updated debounced.
  const [draft, setDraft] = useState(q);
  // Re-sync when the URL `q` changes from elsewhere (tab switch, reset button).
  useEffect(() => setDraft(q), [q]);

  const pushParams = (mutate: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const setParam = (key: string, value: string | null) =>
    pushParams((p) => (value ? p.set(key, value) : p.delete(key)));

  // Debounce the search → URL push (300ms). Skips when the trimmed draft already
  // equals the committed `q`, so an external re-sync doesn't re-push.
  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = draft.trim();
      if (trimmed === q) return;
      setParam('q', trimmed || null);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const hasActiveFilter = !!(q || band || institute);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative sm:max-w-xs sm:flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Titel/Teaser durchsuchen …"
          aria-label="Veranstaltungen durchsuchen"
          className="h-9 pr-8 pl-8"
        />
        {draft && (
          <button
            type="button"
            onClick={() => setDraft('')}
            aria-label="Suche löschen"
            className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <Select
        value={band ?? ALL}
        onValueChange={(v) => setParam('band', v === ALL ? null : v)}
      >
        <SelectTrigger className="h-9 w-full sm:w-[150px]" aria-label="Nach Relevanz filtern">
          <SelectValue placeholder="Relevanz" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Alle Relevanz</SelectItem>
          {EVENTS_BAND_VALUES.map((b) => (
            <SelectItem key={b} value={b}>
              {EVENTS_BAND_LABELS[b]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={institute ?? ALL}
        onValueChange={(v) => setParam('institute', v === ALL ? null : v)}
      >
        <SelectTrigger className="h-9 w-full sm:w-[210px]" aria-label="Nach Institut filtern">
          <SelectValue placeholder="Institut" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Alle Institute</SelectItem>
          {institutes.map((i) => (
            <SelectItem key={i} value={i}>
              {i}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasActiveFilter && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            pushParams((p) => {
              p.delete('q');
              p.delete('band');
              p.delete('institute');
            })
          }
          className="h-9 px-2 text-muted-foreground"
        >
          <X className="mr-1 h-3.5 w-3.5" /> Filter zurücksetzen
        </Button>
      )}
    </div>
  );
}
