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
  HelpCircle,
  Search,
  Keyboard,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/theme-toggle';
import { CommandMenuButton } from '@/components/command/command-menu-button';
import { openCommandMenu, openCheatSheet } from '@/lib/client/commands/controller';

type NavLink = { href: string; label: string; icon: LucideIcon };
type NavGroup = { title: string | null; links: NavLink[] };

/**
 * IA: Sub-grouped sidebar (Workflow / Bibliothek / System).
 * Dashboard sits ungrouped at the start as the home anchor.
 *
 * Group titles only render in the mobile sheet — on desktop the groups are
 * visually separated by thin vertical dividers to keep the bar compact.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    title: null,
    links: [{ href: '/', label: 'Dashboard', icon: BarChart3 }],
  },
  {
    title: 'Bibliothek',
    links: [
      { href: '/publications', label: 'Publikationen', icon: BookOpen },
      { href: '/press-releases', label: 'Pressemitteilungen', icon: Newspaper },
      { href: '/researchers', label: 'Forscher:innen', icon: Users },
    ],
  },
  {
    title: 'Workflow',
    links: [{ href: '/review', label: 'Triage', icon: ClipboardCheck }],
  },
  {
    title: 'System',
    links: [
      { href: '/upload', label: 'Import', icon: Upload },
      { href: '/settings', label: 'Einstellungen', icon: Settings },
    ],
  },
  {
    title: null,
    links: [{ href: '/help', label: 'Hilfe', icon: HelpCircle }],
  },
];

/**
 * Import + Einstellungen render icon-only in the desktop right cluster
 * (next to the theme toggle). The mobile sheet still lists them with
 * labels via NAV_GROUPS, so this stays a single source of truth.
 */
const RIGHT_ICON_LINKS: NavLink[] =
  NAV_GROUPS.find((g) => g.title === 'System')?.links ?? [];

function isActiveLink(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/researchers') {
    return pathname.startsWith('/researchers') || pathname.startsWith('/persons');
  }
  return pathname.startsWith(href);
}

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="bg-brand shadow-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center px-4">
        <Link href="/" className="mr-6 font-semibold text-lg text-white">
          Story Scout
        </Link>

        {/* Desktop nav: groups separated by thin dividers */}
        <nav className="hidden md:flex items-center gap-0.5">
          {NAV_GROUPS.filter((g) => g.title !== 'System').map((group, gi) => (
            <div key={gi} className="flex items-center gap-0.5">
              {gi > 0 && (
                <span aria-hidden="true" className="mx-1.5 h-5 w-px bg-white/20" />
              )}
              {group.links.map(({ href, label, icon: Icon }) => {
                const isActive = isActiveLink(href, pathname);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
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
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <CommandMenuButton />
          {RIGHT_ICON_LINKS.length > 0 && (
            <span
              aria-hidden="true"
              className="mx-1 hidden h-5 w-px bg-white/20 md:block"
            />
          )}
          {RIGHT_ICON_LINKS.map(({ href, label, icon: Icon }) => {
            const isActive = isActiveLink(href, pathname);
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                aria-label={label}
                title={label}
                className={cn(
                  'hidden h-9 w-9 items-center justify-center rounded-md transition-colors md:flex',
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white',
                )}
              >
                <Icon className="h-4 w-4" />
              </Link>
            );
          })}
          <ThemeToggle />

          {/* Mobile hamburger */}
          <Sheet open={open} onOpenChange={setOpen}>
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
                  Story Scout
                </SheetTitle>
              </SheetHeader>
              <nav className="flex-1 flex flex-col gap-3 px-2 py-2 overflow-y-auto">
                {NAV_GROUPS.map((group, gi) => (
                  <div key={gi} className="flex flex-col">
                    {group.title && (
                      <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                        {group.title}
                      </div>
                    )}
                    {group.links.map(({ href, label, icon: Icon }) => {
                      const isActive = isActiveLink(href, pathname);
                      return (
                        <Link
                          key={href}
                          href={href}
                          aria-current={isActive ? 'page' : undefined}
                          onClick={() => setOpen(false)}
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
                ))}
                {/* Touch users have no ⌘K; surface the palette here too. */}
                <div className="mt-1 flex flex-col border-t border-white/10 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
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
                      setOpen(false);
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
