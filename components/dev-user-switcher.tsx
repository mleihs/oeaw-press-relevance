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
type SwitchList = { users: SwitchableUser[]; originAdminId: string };

/**
 * Nutzer-Switcher: passwortloser Identitätswechsel — in Dev UND Prod, aber nur
 * für eingeloggte Admins. Die Autorisierung liegt server-seitig
 * (app/api/dev/switch-user/route.ts, authorize()); hier gilt: die GET-Liste
 * lädt nur für Berechtigte (403 sonst) -> für alle anderen rendert die
 * Komponente nichts. Kein NODE_ENV-Gate mehr.
 *
 * Sitzt in der Nav neben dem Avatar-Menü. Wechselt ein Admin in einen anderen
 * Nutzer, hält ein signierter Herkunfts-Cookie fest, WER gestartet hat —
 * dadurch bleibt der Switcher nutzbar und bietet „Zurück zu mir".
 */
export function DevUserSwitcher() {
  return <UserSwitcherInner />;
}

function UserSwitcherInner() {
  const { user } = useCurrentUser();
  const router = useRouter();
  const qc = useQueryClient();
  const [switching, setSwitching] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['user-switch'],
    queryFn: async (): Promise<SwitchList | null> => {
      const res = await fetch('/api/dev/switch-user');
      // Nicht berechtigt (kein Admin / keine Impersonation) -> Komponente aus.
      if (res.status === 401 || res.status === 403 || res.status === 404) return null;
      if (!res.ok) throw new Error('Nutzerliste konnte nicht geladen werden');
      return (await res.json()) as SwitchList;
    },
    retry: false,
    staleTime: 5 * 60_000,
    enabled: !!user,
  });

  async function switchTo(target: SwitchableUser) {
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
      // Herkunft kann sich geändert haben (Impersonation gestartet/beendet).
      qc.invalidateQueries({ queryKey: ['user-switch'] });
      toast.success(`Angemeldet als ${userLabel(body.user)}`);
      router.refresh();
    } catch (err) {
      toast.error(`Wechsel fehlgeschlagen: ${(err as Error).message}`);
    } finally {
      setSwitching(null);
    }
  }

  // Nur für Berechtigte gerendert (data === null -> nicht autorisiert).
  if (!data) return null;
  const { users, originAdminId } = data;
  const impersonating = !!user && user.id !== originAdminId;
  const originAdmin = users.find((u) => u.id === originAdminId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Nutzer wechseln"
          title={
            impersonating
              ? `Du agierst als ${user ? userLabel(user) : '?'} (Admin: ${originAdmin ? userLabel(originAdmin) : originAdminId})`
              : 'Nutzer wechseln (Admin)'
          }
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-colors',
            impersonating
              ? 'bg-red-500 text-white hover:bg-red-400'
              : 'bg-amber-400/90 text-amber-950 hover:bg-amber-300',
          )}
        >
          <Wrench className="h-3.5 w-3.5" />
          <span className="hidden max-w-[9rem] truncate sm:inline">
            {impersonating ? `als ${user ? userLabel(user) : ''}` : user ? userLabel(user) : 'Ausgeloggt'}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64">
        <DropdownMenuLabel className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
          <Wrench className="h-3.5 w-3.5" />
          Nutzer wechseln (Admin)
        </DropdownMenuLabel>
        {impersonating && originAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => switchTo(originAdmin)}
              disabled={switching !== null}
              className="font-medium text-red-600 dark:text-red-400"
            >
              ↩ Zurück zu {userLabel(originAdmin)}
            </DropdownMenuItem>
          </>
        )}
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
                  {u.id === originAdminId && (
                    <span className="shrink-0 text-[10px] uppercase text-amber-600 dark:text-amber-400">
                      du
                    </span>
                  )}
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
        role === 'admin' ? 'bg-brand/10 text-brand' : 'bg-muted text-muted-foreground',
      )}
    >
      {role}
    </span>
  );
}
