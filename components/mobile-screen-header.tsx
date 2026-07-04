'use client';

import type { ReactNode } from 'react';
import { useCurrentUser } from '@/lib/client/hooks/use-current-user';
import { userInitials } from '@/lib/shared/user-display';

/**
 * Nativer Per-Screen-App-Header (Mobile-Redesign M2, Board-Mobile.dc.html
 * Z. 263–277 / 362–372 / 416–426): kompakte blaue Kopfzeile mit Screen-Icon,
 * Titel, Mono-Subzeile und Initialen-Avatar (User-Session, wie die Top-Nav).
 * Ersetzt unter `md` die Desktop-<h1>-Blöcke (dort `hidden md:*`); volle
 * Breite per Bleed gegen mains `px-4 pt-6`, sodass er nahtlos an die blaue
 * Top-Leiste anschließt. Die iOS-Statusbar-Zeile des Mocks ist Mock-Chrome
 * und wird bewusst nicht nachgebaut.
 */
export function MobileScreenHeader({
  icon,
  title,
  sub,
}: {
  /** Fertig gerendertes Icon-Element (z. B. `<BookOpen size={16} weight="fill" />`)
   *  — als Element statt Komponente, damit Server-Pages es über die
   *  Client-Grenze reichen können (Funktionen sind nicht serialisierbar). */
  icon: ReactNode;
  title: string;
  sub?: string | null;
}) {
  const { user, isLoading } = useCurrentUser();

  return (
    <header className="-mx-4 -mt-6 mb-3.5 bg-brand text-white md:hidden">
      <div className="flex h-[52px] items-center gap-2.5 px-4">
        <span
          aria-hidden
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-white/15"
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold leading-[1.05]">{title}</h1>
          {sub && (
            <p className="mt-px truncate font-mono text-[10px] text-white/65">{sub}</p>
          )}
        </div>
        {isLoading ? (
          // Kein Layout-Shift während des ersten User-Fetches (wie AvatarMenu).
          <span className="h-[34px] w-[34px] shrink-0" aria-hidden />
        ) : user ? (
          <span
            aria-hidden
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#9cc0ff] text-xs font-semibold text-[#00337f]"
          >
            {userInitials(user)}
          </span>
        ) : null}
      </div>
    </header>
  );
}
