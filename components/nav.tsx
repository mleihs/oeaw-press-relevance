'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BarChart3, Upload, BookOpen, Sparkles, Settings } from 'lucide-react';
import { CapybaraLogo } from './capybara-logo';

const links = [
  { href: '/', label: 'Dashboard', icon: BarChart3 },
  { href: '/upload', label: 'Import', icon: Upload },
  { href: '/publications', label: 'Publikationen', icon: BookOpen },
  { href: '/analysis', label: 'Analyse', icon: Sparkles },
  { href: '/settings', label: 'Einstellungen', icon: Settings },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="bg-[#0047bb] shadow-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center px-4">
        <Link href="/" className="mr-8 flex items-center gap-2.5 font-semibold text-lg text-white">
          <CapybaraLogo size="sm" className="text-white" />
          <span>StoryScout</span>
        </Link>
        <nav className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
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
        <div className="ml-auto text-white/60 text-xs font-medium tracking-wider">
          ÖAW
        </div>
      </div>
    </header>
  );
}
