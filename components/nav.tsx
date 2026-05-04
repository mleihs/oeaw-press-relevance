'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BarChart3, Upload, BookOpen, Settings, Menu, Users, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInfoBubblesEnabled } from '@/lib/use-info-bubbles';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

const links = [
  { href: '/', label: 'Dashboard', icon: BarChart3 },
  { href: '/publications', label: 'Publikationen', icon: BookOpen },
  { href: '/researchers', label: 'Forscher:innen', icon: Users },
  { href: '/upload', label: 'Import', icon: Upload },
  { href: '/settings', label: 'Einstellungen', icon: Settings },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [bubblesOn, setBubblesOn] = useInfoBubblesEnabled();

  return (
    <header className="bg-brand shadow-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center px-4">
        <Link href="/" className="mr-8 font-semibold text-lg text-white">
          StoryScout
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === '/' ? pathname === '/'
              : href === '/researchers' ? (pathname.startsWith('/researchers') || pathname.startsWith('/persons'))
              : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => setBubblesOn(!bubblesOn)}
            aria-pressed={bubblesOn}
            title={bubblesOn ? 'Erklärungs-Bubbles ausblenden' : 'Erklärungs-Bubbles einblenden'}
            className={cn(
              'hidden sm:inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
              bubblesOn
                ? 'bg-white/15 text-white hover:bg-white/25'
                : 'text-white/50 hover:bg-white/10 hover:text-white/80',
            )}
          >
            <Info className={cn('h-3.5 w-3.5 transition-opacity', bubblesOn ? 'opacity-100' : 'opacity-60')} />
            <span className="tracking-wide">{bubblesOn ? 'Erklärungen' : 'Erklärungen aus'}</span>
          </button>
          <span className="text-white/60 text-xs font-medium tracking-wider hidden sm:block">
            ÖAW
          </span>

          {/* Mobile hamburger */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="sm:hidden text-white hover:bg-white/10 hover:text-white h-9 w-9 p-0"
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">Navigation öffnen</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-brand border-brand text-white p-0">
              <SheetHeader className="px-4 pt-4 pb-2">
                <SheetTitle className="text-white text-lg font-semibold">StoryScout</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col px-2 py-2">
                {links.map(({ href, label, icon: Icon }) => {
                  const isActive =
                    href === '/' ? pathname === '/'
                    : href === '/researchers' ? (pathname.startsWith('/researchers') || pathname.startsWith('/persons'))
                    : pathname.startsWith(href);
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
                          : 'text-white/70 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </Link>
                  );
                })}
              </nav>
              <div className="px-2 pt-2 pb-1 border-t border-white/10 mt-2">
                <button
                  type="button"
                  onClick={() => setBubblesOn(!bubblesOn)}
                  aria-pressed={bubblesOn}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10"
                >
                  <span className="flex items-center gap-3">
                    <Info className="h-4 w-4" />
                    Erklärungen
                  </span>
                  <span className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wider',
                    bubblesOn ? 'bg-white/30 text-white' : 'bg-white/10 text-white/60'
                  )}>
                    {bubblesOn ? 'AN' : 'AUS'}
                  </span>
                </button>
              </div>
              <div className="mt-auto px-4 py-4 text-white/40 text-xs font-medium tracking-wider">
                ÖAW
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
