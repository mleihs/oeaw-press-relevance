'use client';

import { Moon, Sun, Monitor } from '@/lib/icons';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Theme switcher — Light / Dark / System. Lives in the brand-coloured header
 * (white-on-blue) so the trigger is styled to blend with the nav.
 *
 * The Sun↔Moon swap relies purely on Tailwind `dark:` variants — no `mounted`
 * gate needed because next-themes adds the class to <html> *before* hydration
 * via its inline script (see ThemeProvider's `attribute="class"` setup), so
 * SSR and client render the same icon.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative h-9 w-9 p-0 text-white/70 hover:bg-white/10 hover:text-white"
          aria-label="Theme umschalten"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Theme umschalten</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-32">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          <Sun className="h-4 w-4 mr-2" />
          Hell
          {theme === 'light' && <span className="ml-auto text-xs text-muted-foreground">●</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          <Moon className="h-4 w-4 mr-2" />
          Dunkel
          {theme === 'dark' && <span className="ml-auto text-xs text-muted-foreground">●</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          <Monitor className="h-4 w-4 mr-2" />
          System
          {theme === 'system' && <span className="ml-auto text-xs text-muted-foreground">●</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
