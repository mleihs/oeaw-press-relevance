'use client';

import { useState } from 'react';
import { deAT } from 'react-day-picker/locale';
import { CalendarDays, X } from '@/lib/icons';
import { cn } from '@/lib/shared/utils';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

// Fälligkeits-Picker im shadcn-Muster (Button + Popover-Kalender) statt des
// nativen <input type="date"> (tt.mm.jjjj). Wire-Format bleibt der reine
// Datumsteil 'YYYY-MM-DD' bzw. '' für „kein Datum" — genau das, was die
// bestehenden PATCH-Aufrufe (due_at: v || null) erwarten. Fälligkeiten sind
// Kalenderdaten (UTC-Mitternacht, siehe _lib/due.ts), darum wird hier nur mit
// lokalen Datumskomponenten gerechnet, nie mit toISOString() auf einem lokalen
// Date (das würde in westlichen Zonen einen Tag zurückspringen).

function parseDay(value: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function toDayString(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const LABEL_FORMAT = new Intl.DateTimeFormat('de-AT', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function DueDatePicker({
  value,
  onChange,
  placeholder = 'Kein Datum',
  className,
}: {
  /** 'YYYY-MM-DD' oder '' für „kein Datum". */
  value: string;
  /** Liefert 'YYYY-MM-DD' bzw. '' beim Entfernen. */
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseDay(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Fälligkeitsdatum"
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm transition-colors hover:border-brand-200 hover:bg-brand-50/70',
            open && 'border-brand-200 bg-brand-50/70',
            selected ? 'text-foreground' : 'text-muted-foreground',
            className,
          )}
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">
            {selected ? LABEL_FORMAT.format(selected) : placeholder}
          </span>
          {selected && (
            /* Kein <button> im <button> (invalides DOM) — Radix-Trigger ist
               schon ein Button, darum ein tastaturbedienbares span. */
            <span
              role="button"
              tabIndex={0}
              aria-label="Fälligkeit entfernen"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange('');
                }
              }}
              className="rounded p-0.5 text-muted-foreground hover:text-red-600"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" sideOffset={6}>
        <Calendar
          mode="single"
          locale={deAT}
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => {
            if (d) onChange(toDayString(d));
            setOpen(false);
          }}
          autoFocus
        />
        {selected && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
            className="flex w-full items-center justify-center gap-1.5 border-t px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-red-600"
          >
            <X className="h-3.5 w-3.5" /> Fälligkeit entfernen
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
