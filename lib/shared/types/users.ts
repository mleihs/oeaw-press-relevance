/** Auth (Phase 1 Redaktionsboard) — Supabase-Auth-Identität hinter dem Gate. */

export type UserRole = 'admin' | 'member';

/** Eingeloggte Identität, wie GET /api/auth/me sie liefert (public.users). */
export interface CurrentUser {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
}

/** Zeile der Nutzerverwaltung (admin-only, GET /api/auth/users). */
export interface AdminUserRow extends CurrentUser {
  disabledAt: string | null;
  createdAt: string;
  /** Aus auth.users (Admin-API); null = noch nie angemeldet → „Neu"-Badge. */
  lastSignInAt: string | null;
}
