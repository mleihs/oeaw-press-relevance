import 'server-only';

import { eq } from 'drizzle-orm';
import { db, users } from '@/lib/server/db';
import { ApiAuthError } from '@/lib/server/http';
import type { CurrentUser, UserRole } from '@/lib/shared/types';
import { getSupabaseAuthClient } from './client';

/**
 * Server-seitige Identitäts-Gates (BOARD_PLAN.md §3.1). Reihenfolge der
 * Wahrheit: Supabase-Auth-Session (Cookie, via getUser() gegen den
 * Auth-Server validiert) → public.users-Zeile (role, disabled_at).
 * public.users ist nach dem Anlegen die alleinige Source of Truth für
 * Rolle und Aktiv-Status — NICHT das JWT (app_metadata seedet nur den
 * Anlege-Trigger und wird bei Rollenwechsel nicht mitgezogen).
 *
 * Deaktivierte Nutzer werden doppelt ausgesperrt: auth-seitig per Ban
 * (kein Login/Refresh mehr) und hier per disabled_at-Check, der auch noch
 * gültige Alt-JWTs sofort blockt.
 */

type UserRow = typeof users.$inferSelect;

export type AuthGateResult =
  | { ok: true; user: CurrentUser }
  | { ok: false; status: 401 | 403; message: string };

/** Pure Kernlogik hinter requireUser() — separat, damit sie ohne
 *  Cookie-/DB-Mocks testbar ist. */
export function evaluateUserRow(row: UserRow | undefined | null): AuthGateResult {
  if (!row) {
    // Session ohne users-Zeile heißt: Konto existiert nicht (mehr) —
    // gleiche Antwort wie „nicht angemeldet", kein Informationsleck.
    return { ok: false, status: 401, message: 'Nicht angemeldet.' };
  }
  if (row.disabledAt) {
    return { ok: false, status: 403, message: 'Dieses Konto ist deaktiviert.' };
  }
  return {
    ok: true,
    user: {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      role: row.role as UserRole,
    },
  };
}

/** Pure Admin-Verschärfung von evaluateUserRow. */
export function evaluateAdmin(result: AuthGateResult): AuthGateResult {
  if (!result.ok) return result;
  if (result.user.role !== 'admin') {
    return { ok: false, status: 403, message: 'Nur für Admins.' };
  }
  return result;
}

async function loadUserRow(): Promise<UserRow | null> {
  const supabase = await getSupabaseAuthClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const [row] = await db.select().from(users).where(eq(users.id, data.user.id)).limit(1);
  return row ?? null;
}

/** Aktuelle Identität oder null — für GET /api/auth/me (logged-out ist
 *  dort ein regulärer Zustand, kein Fehler). Deaktivierte gelten als
 *  ausgeloggt. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const result = evaluateUserRow(await loadUserRow());
  return result.ok ? result.user : null;
}

/** Wirft ApiAuthError (401/403) — withApiError macht daraus die
 *  strukturierte Fehlerantwort. */
export async function requireUser(): Promise<CurrentUser> {
  const result = evaluateUserRow(await loadUserRow());
  if (!result.ok) throw new ApiAuthError(result.message, result.status);
  return result.user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const result = evaluateAdmin(evaluateUserRow(await loadUserRow()));
  if (!result.ok) throw new ApiAuthError(result.message, result.status);
  return result.user;
}
