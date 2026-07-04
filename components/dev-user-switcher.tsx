'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Wrench, Check } from '@/lib/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCurrentUser } from '@/lib/client/hooks/use-current-user';
import { QK } from '@/lib/client/query-keys';
import { userLabel } from '@/lib/shared/user-display';
import { cn } from '@/lib/shared/utils';
import type { CurrentUser, UserRole } from '@/lib/shared/types';

type SwitchableUser = CurrentUser & { disabledAt: string | null };

/**
 * NUR Entwicklung: passwortloser Identitätswechsel fürs Board-Testing.
 * Rendert in Prod garantiert nichts (process.env.NODE_ENV wird im Client-
 * Bundle inlined -> der Zweig fällt beim Build weg). Backend-Gegenstück:
 * app/api/dev/switch-user/route.ts (dort ebenfalls hart NODE_ENV-gated).
 *
 * Sitzt in der Nav neben dem Avatar-Menü, ist also auf jeder Seite da —
 * die Identität ist global, das Board (Kommentare/Zuweisungen/Realtime)
 * liest sie serverseitig, daher nach dem Wechsel router.refresh().
 */
export function DevUserSwitcher() {
  if (process.env.NODE_ENV === 'production') return null;
  return <DevUserSwitcherInner />;
}

function DevUserSwitcherInner() {
  const { user } = useCurrentUser();
  const router = useRouter();
  const qc = useQueryClient();
  const [switching, setSwitching] = useState<string | null>(null);

  const { data: users = [] } = useQuery({
    queryKey: ['dev-switch-users'],
    queryFn: async (): Promise<SwitchableUser[]> => {
      const res = await fetch('/api/dev/switch-user');
      if (!res.ok) throw new Error('Nutzerliste konnte nicht geladen werden');
      const body = (await res.json()) as { users: SwitchableUser[] };
      return body.users;
    },
    staleTime: 5 * 60_000,
  });

  async function switchTo(target: SwitchableUser) {
    // Deaktivierte Konten sind auth-seitig gebannt — eine Session ist
    // bauartbedingt unmöglich (verifyOtp scheitert). Erst gar nicht senden.
    if (target.id === user?.id || target.disabledAt) return;
    setSwitching(target.id);
    try {
      const res = await fetch('/api/dev/switch-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: target.id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { user: CurrentUser };
      qc.setQueryData(QK.currentUser, body.user);
      qc.removeQueries({ queryKey: QK.adminUsers });
      toast.success(`Angemeldet als ${userLabel(body.user)}`);
      router.refresh();
    } catch (err) {
      toast.error(`Wechsel fehlgeschlagen: ${(err as Error).message}`);
    } finally {
      setSwitching(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Nutzer wechseln (DEV)"
          title="Nutzer wechseln (nur Entwicklung)"
          className="flex h-8 items-center gap-1.5 rounded-md bg-amber-400/90 px-2 text-xs font-semibold text-amber-950 transition-colors hover:bg-amber-300"
        >
          <Wrench className="h-3.5 w-3.5" />
          <span className="hidden max-w-[9rem] truncate sm:inline">
            {user ? userLabel(user) : 'Ausgeloggt'}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64">
        <DropdownMenuLabel className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
          <Wrench className="h-3.5 w-3.5" />
          Nutzer wechseln (DEV)
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {users.map((u) => {
          const active = u.id === user?.id;
          return (
            <DropdownMenuItem
              key={u.id}
              onClick={() => switchTo(u)}
              disabled={switching !== null || !!u.disabledAt}
              className={cn('flex items-start gap-2', active && 'bg-accent')}
            >
              <span className="mt-0.5 w-3.5 shrink-0">
                {active && <Check className="h-3.5 w-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-medium">{userLabel(u)}</span>
                  <RoleTag role={u.role} />
                  {u.disabledAt && (
                    <span className="shrink-0 text-[10px] uppercase text-red-500">
                      deaktiviert
                    </span>
                  )}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RoleTag({ role }: { role: UserRole }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded px-1 text-[10px] font-medium uppercase',
        role === 'admin'
          ? 'bg-brand/10 text-brand'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {role}
    </span>
  );
}
