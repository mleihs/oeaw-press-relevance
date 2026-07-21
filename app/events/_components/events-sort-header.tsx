import Link from 'next/link';
import { ArrowDown, ArrowUp, ArrowUpDown } from '@/lib/icons';
import { cn } from '@/lib/shared/utils';
import { buildEventsSortUrl, type EventsFilterState } from '../_lib/build-events-url';
import type {
  EventsSort,
  EventsSortOrder,
  EventsTab,
} from '@/lib/shared/events-filter';

/**
 * Sortierköpfe der Veranstaltungs-Liste: „Datum" und „Relevanz", je mit
 * Richtungspfeil.
 *
 * Die URL-Mechanik (`sort`/`order`, listEvents) war durchgehend intakt — der
 * Kommentar in build-events-url.ts spricht seit jeher von „column-sort links" —
 * aber es gab kein Bedienelement: sortieren ging nur, indem man die Query von
 * Hand schrieb. Dieselbe Lücke, die die Publikationsliste beim Umbau auf
 * Karten-Zeilen hatte und die dort die SortDropdown schließt. Hier passen
 * Spaltenköpfe besser als ein Dropdown, weil es genau zwei Felder gibt und
 * beide eine sichtbare Spalte haben, über der der Pfeil stehen kann.
 *
 * Links statt Client-State: die Liste ist eine RSC-Seite, jeder Kopf ist ein
 * gewöhnlicher Href über denselben Builder wie Tabs und Kalender-Navigation.
 * Damit bleibt die Sortierung teil- und reload-fest und nimmt Suche, Band und
 * Institut mit. Die Href-Regeln (umdrehen / natürliche Erstrichtung / Vorgabe
 * fällt aus der URL) liegen als buildEventsSortUrl im URL-Builder, wo sie
 * getestet sind.
 */

const FIELDS: { key: EventsSort; label: string; hint: string }[] = [
  { key: 'date', label: 'Datum', hint: 'nach Veranstaltungsdatum sortieren' },
  { key: 'score', label: 'Relevanz', hint: 'nach Relevanz-Score sortieren' },
];

export function EventsSortHeader({
  sort,
  order,
  tab,
  main,
  filters,
}: {
  sort: EventsSort;
  order: EventsSortOrder;
  tab: EventsTab;
  main: boolean;
  filters: EventsFilterState;
}) {
  const link = (field: EventsSort) =>
    buildEventsSortUrl({ field, sort, order, tab, main, filters });

  return (
    <div className="flex items-center gap-4 border-b border-line bg-surface-muted px-[18px] py-2">
      <div className="flex min-w-0 flex-1 items-center">
        <SortLink field={FIELDS[0]} sort={sort} order={order} href={link('date')} />
      </div>
      <SortLink field={FIELDS[1]} sort={sort} order={order} href={link('score')} />
      {/* Spiegelt die Aktionsspalte der Zeilen, damit „Relevanz" über dem
          Score-Badge steht und nicht darüber hinausrutscht. */}
      <span aria-hidden className="w-[230px] shrink-0" />
    </div>
  );
}

function SortLink({
  field,
  sort,
  order,
  href,
}: {
  field: (typeof FIELDS)[number];
  sort: EventsSort;
  order: EventsSortOrder;
  href: string;
}) {
  const active = sort === field.key;
  const Icon = !active ? ArrowUpDown : order === 'asc' ? ArrowUp : ArrowDown;
  const dir = order === 'asc' ? 'aufsteigend' : 'absteigend';

  // Kein aria-sort: das Attribut gehört an ein columnheader-Element, nicht an
  // einen Link, und wäre hier schlicht wirkungslos. Den Zustand trägt der
  // sr-only-Text im Label.
  return (
    <Link
      href={href}
      title={active ? `${field.label}: ${dir}. Klicken dreht die Richtung um.` : field.hint}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-[7px] px-1.5 py-0.5 font-mono text-2xs font-semibold uppercase tracking-[0.06em] transition-colors',
        'hover:bg-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'text-ink' : 'text-ink-muted hover:text-ink-soft',
      )}
    >
      {field.label}
      <Icon
        aria-hidden
        weight="bold"
        className={cn('h-3 w-3', active ? 'text-brand' : 'text-ink-muted/70')}
      />
      <span className="sr-only">
        {active ? `, ${dir} sortiert` : `, ${field.hint}`}
      </span>
    </Link>
  );
}
