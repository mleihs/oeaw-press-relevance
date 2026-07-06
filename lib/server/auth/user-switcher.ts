import 'server-only';
import { cookies } from 'next/headers';
import { asc, eq } from 'drizzle-orm';
import { db, users } from '@/lib/server/db';
import { getCurrentUser } from '@/lib/server/auth/require';
import {
  IMPERSONATION_COOKIE,
  readImpersonationOrigin,
} from '@/lib/server/auth/impersonation';
import type { UserRole } from '@/lib/shared/types';

export type UserSwitchAuth =
  | { ok: true; originAdminId: string }
  | { ok: false };

/**
 * Autorisierung für den Nutzer-Switcher: erlaubt, wenn die aktive Session ein
 * Admin ist ODER ein gültiger, signierter Herkunfts-Cookie belegt, dass ein
 * Admin die Impersonation gestartet hat. Der Herkunfts-Cookie hat Vorrang → der
 * ursprüngliche Admin bleibt auch über Admin→Admin-Wechsel hinweg stabil
 * („Zurück zu mir" zielt auf den Start). Hält den Switcher nutzbar, wenn ein
 * Admin gerade als Member agiert — sonst wäre der Wechsel eine Einbahnstraße.
 */
export async function authorizeUserSwitch(): Promise<UserSwitchAuth> {
  const store = await cookies();
  const cookieOrigin = readImpersonationOrigin(
    store.get(IMPERSONATION_COOKIE)?.value,
  );
  if (cookieOrigin) {
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.id, cookieOrigin))
      .limit(1);
    if (row && row.role === 'admin' && !row.disabledAt) {
      return { ok: true, originAdminId: cookieOrigin };
    }
  }
  const current = await getCurrentUser();
  if (current?.role === 'admin') return { ok: true, originAdminId: current.id };
  return { ok: false };
}

/**
 * Auswahlliste für den Switcher: alle Konten (inkl. deaktivierter — so lässt
 * sich auch der Ausgeloggt-/Gesperrt-Zustand testen), nach E-Mail sortiert.
 */
export async function listSwitchableUsers() {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      disabledAt: users.disabledAt,
    })
    .from(users)
    .orderBy(asc(users.email));
  return rows.map((r) => ({ ...r, role: r.role as UserRole }));
}
