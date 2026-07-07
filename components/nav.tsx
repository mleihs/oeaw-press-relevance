'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/shared/utils';
import {
  BarChart3,
  Upload,
  BookOpen,
  Settings,
  Menu,
  Users,
  ClipboardCheck,
  Newspaper,
  CalendarDays,
  Radar,
  HelpCircle,
  Search,
  Keyboard,
  ChevronDown,
  Layers,
  Kanban,
  RadioButton,
  type LucideIcon,
} from '@/lib/icons';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/theme-toggle';
import { AvatarMenu } from '@/components/avatar-menu';
import { useCurrentUser } from '@/lib/client/hooks/use-current-user';
import { DevUserSwitcher } from '@/components/dev-user-switcher';
import { CommandMenuButton } from '@/components/command/command-menu-button';
import { openCommandMenu, openCheatSheet } from '@/lib/client/commands/controller';

type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Optional one-liner shown only in dropdown items (not in primary tabs). */
  desc?: string;
};

/**
 * IA — three frequency tiers reflected in the visual hierarchy:
 *
 *   PRIMARY     daily must-see, always-visible labelled tabs on the top bar
 *   SECONDARY   weekly browse / lookup, hidden behind the "Mehr ▾" dropdown
 *   ADMIN       monthly admin tooling, hidden behind the ⚙️ ▾ dropdown
 *
 * Mobile sheet renders all three tiers flat under labelled headings since
 * vertical space is plentiful and progressive disclosure adds friction on
 * touch. Both views read from the same source-of-truth arrays so adding a
 * route is a single-line change.
 */
export const PRIMARY: NavLink[] = [
  { href: '/',                label: 'Dashboard',       icon: BarChart3 },
  { href: '/publications',    label: 'Publikationen',   icon: BookOpen },
  { href: '/events',          label: 'Veranstaltungen', icon: CalendarDays },
  { href: '/board',           label: 'Board',           icon: Kanban },
];

const SECONDARY: NavLink[] = [
  {
    href: '/review',
    label: 'Triage',
    icon: ClipboardCheck,
    desc: 'Sichtung & Redaktionsentscheidung für Publikationen und Veranstaltungen.',
  },
  {
    href: '/press-releases',
    label: 'Pressemitteilungen',
    icon: Newspaper,
    desc: 'ÖAW-Pressemitteilungen mit DOI-Verweis, gematcht oder als Orphans.',
  },
  {
    href: '/researchers',
    label: 'Forscher:innen',
    icon: Users,
    desc: 'Personen-Ranking, Coauthorship, Aktivitätsprofile.',
  },
  {
    href: '/social',
    label: 'Social Media',
    icon: Radar,
    desc: 'Themen-Lagebild aus beobachteten Social-Media-Kanälen.',
  },
];

const ADMIN: NavLink[] = [
  { href: '/settings', label: 'Einstellungen', icon: Settings },
  { href: '/upload',   label: 'Import',        icon: Upload },
];

export function isActiveLink(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/researchers') {
    return pathname.startsWith('/researchers') || pathname.startsWith('/persons');
  }
  return pathname.startsWith(href);
}

function isAnyActive(items: NavLink[], pathname: string): boolean {
  return items.some((i) => isActiveLink(i.href, pathname));
}

/**
 * Single labelled tab on the top bar. Icon + label + active-pill. Active-
 * pill uses `bg-white/20` against the brand bar, matching the previous
 * design language so the refactor stays drop-in for visual fidelity.
 */
function NavTabLink({
  href,
  label,
  icon: Icon,
  pathname,
  ice,
}: NavLink & { pathname: string; ice?: boolean }) {
  const isActive = isActiveLink(href, pathname);
  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
        ice && 'ice-nav relative overflow-hidden',
        isActive
          ? 'bg-white/20 text-white'
          : 'text-white/70 hover:bg-white/10 hover:text-white',
      )}
    >
      {/* Dauer-Hinweis: leicht frostiges Icon im Ruhezustand — bewusst nur ein
          Hauch Blau (fast weiß), nicht kräftig. */}
      <Icon className={cn('h-4 w-4', ice && !isActive && 'text-[#e2ecfb]')} />
      {label}
      {ice && <IceNavFrost />}
    </Link>
  );
}

/** Mikro-Eis fürs Board-Item: bei Hover rieseln winzige Flocken herab und
 *  schmelzen (Callback zum Login-Eis), plus ein feiner Frost-Schimmer. Rein
 *  CSS, pointer-events-none, out-of-flow — stört Layout/Klick nicht. */
function IceNavFrost() {
  // Langsam rieseln + sanft wegschmelzen (User-Wunsch). Versetzte Starts,
  // damit nicht alle gleichzeitig fallen.
  const flakes = [
    { l: '9%', s: 8, dur: '4.4s', del: '0s' },
    { l: '27%', s: 6, dur: '3.8s', del: '1.3s' },
    { l: '44%', s: 9, dur: '5.0s', del: '.5s' },
    { l: '60%', s: 7, dur: '4.2s', del: '2.1s' },
    { l: '76%', s: 6, dur: '4.7s', del: '.9s' },
    { l: '90%', s: 8, dur: '4.0s', del: '2.7s' },
  ];
  return (
    <span aria-hidden>
      <span className="ice-nav-sheen" />
      {flakes.map((f, i) => (
        <span
          key={i}
          className="ice-nav-flake"
          style={
            {
              left: f.l,
              fontSize: f.s,
              '--fdur': f.dur,
              '--fdel': f.del,
            } as React.CSSProperties
          }
        >
          ❄
        </span>
      ))}
    </span>
  );
}

/**
 * Top-bar dropdown trigger + Popover-based menu. Two call sites:
 *   - `Mehr ▾` (label + Layers icon + chevron) for SECONDARY content
 *   - `⚙️ ▾`   (icon-only + chevron) for ADMIN tools
 *
 * Active-state propagates: when the current pathname matches any contained
 * item the trigger also gets the active pill, so a user on
 * `/press-releases` sees a visual breadcrumb on the closed nav bar. Inside
 * the menu the matched item additionally gets its own active style.
 *
 * Click-based (not hover) — matches Linear / Vercel / GitHub conventions
 * and avoids accidental flashes while moving the cursor across the bar.
 * Keyboard nav (arrow keys, Esc, Enter) is provided by Radix Popover.
 */
function NavDropdown({
  label,
  icon: Icon,
  items,
  pathname,
  align,
  showLabel = true,
  ariaLabel,
}: {
  label?: string;
  icon?: LucideIcon;
  items: NavLink[];
  pathname: string;
  align: 'start' | 'end';
  showLabel?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const anyActive = isAnyActive(items, pathname);
  const triggerActive = anyActive || open;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel ?? label}
          aria-expanded={open}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
            triggerActive
              ? 'bg-white/20 text-white'
              : 'text-white/70 hover:bg-white/10 hover:text-white',
          )}
        >
          {Icon && <Icon className="h-4 w-4" />}
          {showLabel && label && <span>{label}</span>}
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={6}
        className="w-72 p-1.5"
      >
        <div className="flex flex-col">
          {items.map((item) => (
            <NavDropdownItem
              key={item.href}
              {...item}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NavDropdownItem({
  href,
  label,
  icon: Icon,
  desc,
  pathname,
  onNavigate,
}: NavLink & { pathname: string; onNavigate: () => void }) {
  const isActive = isActiveLink(href, pathname);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-start gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
        isActive ? 'bg-muted' : 'hover:bg-muted/60',
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          'h-4 w-4 mt-0.5 shrink-0',
          isActive ? 'text-brand' : 'text-muted-foreground',
        )}
      />
      <div className="min-w-0">
        <div className="font-medium text-foreground">{label}</div>
        {desc && (
          <div className="text-xs text-muted-foreground mt-0.5 leading-snug">
            {desc}
          </div>
        )}
      </div>
    </Link>
  );
}

export function Nav() {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const helpActive = isActiveLink('/help', pathname);
  // Mikro-Eis am Board-Item nur, wenn ein echter Nutzer angemeldet ist (das
  // Board hängt an der noch „auf Eis" liegenden persönlichen Anmeldung).
  const { user } = useCurrentUser();

  return (
    <header className="bg-brand shadow-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center px-4">
        <Link href="/" className="mr-6 flex items-center gap-2 font-semibold text-lg text-white">
          {/* Marken-Logo wie im Login-Design: gefüllter RadioButton in Hellblau */}
          <RadioButton weight="fill" aria-hidden className="h-6 w-6 text-[#9cc0ff]" />
          ÖAW Presse
        </Link>

        {/* Desktop primary tabs + Mehr dropdown */}
        <nav className="hidden md:flex items-center gap-0.5">
          {PRIMARY.map((link) => (
            <NavTabLink
              key={link.href}
              {...link}
              pathname={pathname}
              ice={link.href === '/board' && !!user}
            />
          ))}
          <NavDropdown
            label="Mehr"
            icon={Layers}
            items={SECONDARY}
            pathname={pathname}
            align="start"
          />
        </nav>

        {/* Right cluster: ⌘K + Hilfe + ⚙️ dropdown + Theme + mobile hamburger */}
        <div className="ml-auto flex items-center gap-1">
          <CommandMenuButton />
          <Link
            href="/help"
            aria-label="Hilfe"
            title="Hilfe"
            aria-current={helpActive ? 'page' : undefined}
            className={cn(
              'hidden h-9 w-9 items-center justify-center rounded-md transition-colors md:flex',
              helpActive
                ? 'bg-white/20 text-white'
                : 'text-white/70 hover:bg-white/10 hover:text-white',
            )}
          >
            <HelpCircle className="h-4 w-4" />
          </Link>
          <div className="hidden md:block">
            <NavDropdown
              icon={Settings}
              items={ADMIN}
              pathname={pathname}
              align="end"
              showLabel={false}
              ariaLabel="Einstellungen und Import"
            />
          </div>
          <ThemeToggle />
          <DevUserSwitcher />
          <AvatarMenu />

          {/* Mobile hamburger sheet */}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden text-white hover:bg-white/10 hover:text-white h-9 w-9 p-0"
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">Navigation öffnen</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-72 bg-brand border-brand text-white p-0 flex flex-col"
            >
              <SheetHeader className="px-4 pt-4 pb-2">
                <SheetTitle className="text-white text-lg font-semibold">
                  ÖAW Presse
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Hauptnavigation: Bereiche, Schnellzugriffe und Einstellungen.
                </SheetDescription>
              </SheetHeader>
              <nav className="flex-1 flex flex-col gap-3 px-2 py-2 overflow-y-auto">
                <MobileGroup
                  items={PRIMARY}
                  pathname={pathname}
                  onNavigate={() => setSheetOpen(false)}
                />
                <MobileGroup
                  title="Mehr"
                  items={SECONDARY}
                  pathname={pathname}
                  onNavigate={() => setSheetOpen(false)}
                />
                <MobileGroup
                  title="System"
                  items={[
                    { href: '/help', label: 'Hilfe', icon: HelpCircle },
                    ...ADMIN,
                  ]}
                  pathname={pathname}
                  onNavigate={() => setSheetOpen(false)}
                />
                {/* Touch users have no ⌘K; surface palette + cheat-sheet here. */}
                <div className="mt-1 flex flex-col border-t border-white/10 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSheetOpen(false);
                      openCommandMenu();
                    }}
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <Search className="h-4 w-4" />
                    Suchen / Befehle
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSheetOpen(false);
                      openCheatSheet();
                    }}
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <Keyboard className="h-4 w-4" />
                    Tastenkürzel
                  </button>
                </div>
              </nav>
              <div className="px-4 py-4 text-white/40 text-xs font-medium tracking-wider border-t border-white/10">
                ÖAW
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

function MobileGroup({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title?: string;
  items: NavLink[];
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <div className="flex flex-col">
      {title && (
        <div className="px-3 pt-2 pb-1 text-2xs font-semibold uppercase tracking-wider text-white/40">
          {title}
        </div>
      )}
      {items.map(({ href, label, icon: Icon }) => {
        const isActive = isActiveLink(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-white/20 text-white'
                : 'text-white/70 hover:bg-white/10 hover:text-white',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
