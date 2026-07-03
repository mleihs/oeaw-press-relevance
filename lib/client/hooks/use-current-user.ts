'use client';

import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QK } from '@/lib/client/query-keys';
import type { CurrentUser } from '@/lib/shared/types';

// Hydration-Signal: false im Server-Render UND im Client-Hydration-Render,
// true danach. React 19 hydriert Subtrees verzögert — bis dahin kann die
// me-Query schon aufgelöst sein, und ein Konsument, der auf ihr verzweigt,
// rendert beim Hydrieren einen anderen Baum als das Server-HTML
// (beobachteter Mismatch an der Settings-Karte, 2026-07-03). Muster wie
// loadSettingsSnapshot/getServerSnapshot in settings-store.
const emptySubscribe = () => () => {};
function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const res = await fetch('/api/auth/me');
  if (!res.ok) throw new Error('Identität konnte nicht geladen werden');
  const body = (await res.json()) as { user: CurrentUser | null };
  return body.user;
}

/**
 * Aktuelle Supabase-Auth-Identität (oder null = nicht angemeldet).
 * Login/Logout schreiben den Cache direkt (setQueryData auf QK.currentUser),
 * daher darf staleTime großzügig sein — der Server bleibt trotzdem die
 * einzige Autorität (jede API-Route prüft selbst via requireUser/-Admin).
 */
export function useCurrentUser() {
  const hydrated = useHydrated();
  const query = useQuery({
    queryKey: QK.currentUser,
    queryFn: fetchCurrentUser,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const user = query.data ?? null;
  return {
    user,
    isAdmin: user?.role === 'admin',
    // Solange nicht hydriert, IMMER „lädt" — dann rendern Konsumenten
    // deterministisch dasselbe wie der Server (isPending allein reicht
    // nicht: die Query kann vor der verzögerten Hydration fertig sein).
    isLoading: !hydrated || query.isPending,
  };
}
