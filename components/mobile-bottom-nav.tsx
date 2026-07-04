'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/shared/utils';
import { PRIMARY, isActiveLink } from '@/components/nav';

/**
 * Native-Shell Bottom-Tab-Nav (Mobile-Redesign M1, Board-Mobile.dc.html
 * Z. 539–547). Nur unter `md` sichtbar; Desktop behält die Top-Tabs.
 * Tabs = PRIMARY aus nav.tsx (eine Quelle für Routen/Icons/Aktiv-Logik);
 * SECONDARY/ADMIN bleiben im Hamburger-Sheet der Top-Leiste erreichbar.
 */

/** Kurz-Labels: 5 Tabs teilen sich ~360px, „Veranstaltungen" sprengt den Slot. */
const TAB_LABELS: Record<string, string> = {
  '/events': 'Events',
};

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Hauptbereiche"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="flex h-14 items-stretch">
        {PRIMARY.map(({ href, label, icon: Icon }) => {
          const isActive = isActiveLink(href, pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-[3px] transition-colors',
                isActive ? 'text-brand' : 'text-ink-muted',
              )}
            >
              <Icon size={21} weight={isActive ? 'fill' : 'regular'} aria-hidden />
              <span
                className={cn(
                  'text-[10px] leading-none',
                  isActive ? 'font-semibold' : 'font-medium',
                )}
              >
                {TAB_LABELS[href] ?? label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
