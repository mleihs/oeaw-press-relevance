'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { LogIn, LogOut } from '@/lib/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCurrentUser } from '@/lib/client/hooks/use-current-user';
import { QK } from '@/lib/client/query-keys';
import { userInitials, userLabel } from '@/lib/shared/user-display';

/**
 * Avatar mit Konto-Menü in der Nav (Design: Redaktionsboard.dc.html,
 * Header rechts). Ausgeloggt → Anmelden-Link; eingeloggt → Initialen-
 * Avatar mit Name/E-Mail und Abmelden.
 */
export function AvatarMenu() {
  const { user, isLoading } = useCurrentUser();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Kein Layout-Shift während des ersten Fetches.
  if (isLoading) return <div className="h-9 w-9" aria-hidden />;

  if (!user) {
    return (
      <Link
        href="/login"
        aria-label="Anmelden"
        title="Anmelden"
        className="flex h-9 w-9 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
      >
        <LogIn className="h-4 w-4" />
      </Link>
    );
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    queryClient.setQueryData(QK.currentUser, null);
    // Admin-Daten (Nutzerverwaltung) nicht über den Logout hinaus cachen.
    queryClient.removeQueries({ queryKey: QK.adminUsers });
    router.push('/login');
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Konto-Menü"
          className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-white/25 text-xs font-semibold text-white transition-colors hover:bg-white/35"
        >
          {userInitials(user)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-56">
        <div className="px-2 py-1.5">
          <div className="truncate text-sm font-medium">{userLabel(user)}</div>
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Abmelden
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
