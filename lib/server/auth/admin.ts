import 'server-only';

import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { db, users, getSupabaseAdmin } from '@/lib/server/db';
import { ApiValidationError } from '@/lib/server/http';
import { generatePassword } from '@/lib/shared/password';
import type { AdminUserRow, UserRole } from '@/lib/shared/types';
import type { UserCreatePayload, UserPatchPayload } from '@/lib/shared/schemas';

/**
 * Nutzerverwaltung (admin-only, BOARD_PLAN.md §3.1): Anlegen, Rolle,
 * Deaktivieren, Passwort-Reset — alles über die Supabase-Admin-API
 * (service-role) plus Drizzle auf public.users. Kein SMTP: Initial- und
 * Reset-Passwörter werden einmalig im Response angezeigt und persönlich
 * weitergegeben.
 *
 * Deaktivieren = disabled_at setzen (requireUser blockt sofort, auch bei
 * noch gültigem JWT) + auth-seitiger Ban (blockt Login und Token-Refresh).
 * Nutzer werden nie gelöscht — Autorschaft (Phase 2+) überlebt so
 * Personalwechsel; die DB erzwingt das über RESTRICT-FKs auf users.
 */

// Praktisch „für immer" — Supabase kennt kein unbefristetes Ban-Flag,
// nur eine Dauer.
const BAN_FOREVER = '87600h'; // 10 Jahre

type UserRow = typeof users.$inferSelect;

function toAdminRow(row: UserRow, lastSignInAt: string | null): AdminUserRow {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role as UserRole,
    disabledAt: row.disabledAt,
    createdAt: row.createdAt,
    lastSignInAt,
  };
}

/**
 * Pure Guard für PATCH-Mutationen — separat testbar. Liefert die
 * Fehlermeldung oder null (= erlaubt).
 *
 * Zwei Invarianten:
 *  1. Niemand deaktiviert das eigene Konto (sonst sofortiger Selbst-Aussperr-
 *     Unfall mit laufender Session).
 *  2. Es bleibt immer mindestens ein aktiver Admin übrig — sonst ist die
 *     Nutzerverwaltung dauerhaft unerreichbar (Rollen ändern kann nur ein
 *     Admin).
 */
export function validateUserPatch(input: {
  actorId: string;
  target: Pick<UserRow, 'id' | 'role' | 'disabledAt'>;
  patch: UserPatchPayload;
  activeAdminCount: number;
}): string | null {
  const { actorId, target, patch, activeAdminCount } = input;

  if (patch.disabled === true && target.id === actorId) {
    return 'Du kannst dein eigenes Konto nicht deaktivieren.';
  }

  const targetIsActiveAdmin = target.role === 'admin' && !target.disabledAt;
  const losesAdmin = targetIsActiveAdmin && (patch.role === 'member' || patch.disabled === true);
  if (losesAdmin && activeAdminCount <= 1) {
    return 'Der letzte aktive Admin kann weder deaktiviert noch zu Member gemacht werden.';
  }

  return null;
}

async function getUserRowOrThrow(id: string): Promise<UserRow> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!row) throw new ApiValidationError('Nutzer nicht gefunden.');
  return row;
}

async function getLastSignInAt(id: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.getUserById(id);
  if (error || !data.user) return null;
  return data.user.last_sign_in_at ?? null;
}

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const rows = await db.select().from(users).orderBy(asc(users.createdAt));
  if (rows.length === 0) return [];

  const admin = getSupabaseAdmin();
  // 10-Personen-Team; eine Seite reicht auf absehbare Zeit.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`Auth-Nutzerliste fehlgeschlagen: ${error.message}`);
  const lastSignIn = new Map(data.users.map((u) => [u.id, u.last_sign_in_at ?? null]));

  return rows.map((row) => toAdminRow(row, lastSignIn.get(row.id) ?? null));
}

export async function createAdminUser(input: UserCreatePayload): Promise<AdminUserRow> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    // Kein SMTP/Bestätigungs-Flow: Konten legt der Admin an, die E-Mail
    // gilt als verifiziert.
    email_confirm: true,
    user_metadata: { display_name: input.displayName },
    // Nur informativ (raw_app_meta_data ist service-role-only und damit
    // vertrauenswürdig) — verlässlich ist es NICHT: GoTrue schreibt die
    // auth.users-Zeile zuerst nur mit provider/providers und merged das
    // custom app_metadata erst nach dem INSERT, der Spiegel-Trigger sieht
    // die Rolle also nicht (verifiziert 2026-07-03 gegen den lokalen
    // Stack). Deshalb das explizite Rollen-Update unten.
    app_metadata: { role: input.role },
  });
  if (error) {
    if (error.code === 'email_exists') {
      throw new ApiValidationError('Für diese E-Mail-Adresse existiert bereits ein Konto.');
    }
    throw new Error(`Konto-Anlage fehlgeschlagen: ${error.message}`);
  }

  // Der Insert-Trigger hat die public.users-Zeile synchron miterzeugt
  // (Default-Rolle member); die gewünschte Rolle setzt die Source of
  // Truth direkt.
  await getUserRowOrThrow(data.user.id);
  const [row] = await db
    .update(users)
    .set({ role: input.role })
    .where(eq(users.id, data.user.id))
    .returning();
  return toAdminRow(row, null);
}

export async function patchAdminUser(
  actorId: string,
  id: string,
  patch: UserPatchPayload,
): Promise<AdminUserRow> {
  const target = await getUserRowOrThrow(id);

  const [{ n: activeAdminCount }] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, 'admin'), isNull(users.disabledAt)));

  const message = validateUserPatch({ actorId, target, patch, activeAdminCount });
  if (message) throw new ApiValidationError(message);

  const changes: Partial<Pick<UserRow, 'role' | 'disabledAt'>> = {};
  if (patch.role !== undefined) changes.role = patch.role;
  if (patch.disabled !== undefined) {
    changes.disabledAt = patch.disabled ? new Date().toISOString() : null;
  }
  // Erst public.users (die Zeile, gegen die requireUser prüft — damit greift
  // die Sperre sofort), dann der auth-seitige Ban. Scheitert der Ban, bleibt
  // die Sperre serverseitig trotzdem wirksam; der Aufruf ist idempotent
  // wiederholbar.
  const [updated] = await db.update(users).set(changes).where(eq(users.id, id)).returning();

  if (patch.disabled !== undefined) {
    const admin = getSupabaseAdmin();
    const { error } = await admin.auth.admin.updateUserById(id, {
      ban_duration: patch.disabled ? BAN_FOREVER : 'none',
    });
    if (error) throw new Error(`Auth-Sperre fehlgeschlagen: ${error.message}`);
  }

  return toAdminRow(updated, await getLastSignInAt(id));
}

export async function resetAdminUserPassword(id: string): Promise<string> {
  await getUserRowOrThrow(id);
  const password = generatePassword();
  const admin = getSupabaseAdmin();
  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error) throw new Error(`Passwort-Reset fehlgeschlagen: ${error.message}`);
  return password;
}
