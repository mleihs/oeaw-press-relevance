import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from '@/lib/icons';

/**
 * Blauer Mobile-Header für Detail-Pages (M6c, Board-Mobile.dc.html Z. 800–810):
 * Zurück-Pfeil + Screen-Titel + optionaler Aktions-Slot rechts (z. B. Flag-Pin).
 * Gegenstück zum MobileScreenHeader der Listen-Screens; gleiche Bleed-Mechanik
 * gegen mains `px-4 pt-6`, nur unter `md` sichtbar. Muss AUSSERHALB von
 * `space-y`-Containern stehen (§M2-Gotcha: strukturelle `* + *`-Margins).
 */
export function MobileDetailHeader({
  backHref,
  title,
  right,
}: {
  backHref: string;
  title: string;
  right?: ReactNode;
}) {
  return (
    <header className="-mx-4 -mt-6 mb-3.5 bg-brand text-white md:hidden">
      <div className="flex h-[52px] items-center gap-2 px-3">
        <Link
          href={backHref}
          aria-label="Zurück"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white/15"
        >
          <ArrowLeft aria-hidden className="h-[18px] w-[18px]" />
        </Link>
        <div className="min-w-0 flex-1 truncate text-[15px] font-semibold">
          {title}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </header>
  );
}
