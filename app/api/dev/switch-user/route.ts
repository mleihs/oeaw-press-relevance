import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { asc, eq } from 'drizzle-orm';
import { apiError, withApiError } from '@/lib/server/http';
import { db, users, getSupabaseAdmin } from '@/lib/server/db';
import { getSupabaseAuthClient } from '@/lib/server/auth/client';
import { getCurrentUser } from '@/lib/server/auth/require';
import {
  IMPERSONATION_COOKIE,
  readImpersonationOrigin,
  signImpersonationOrigin,
} from '@/lib/server/auth/impersonation';
import type { UserRole } from '@/lib/shared/types';

export const dynamic = 'force-dynamic';

/**
 * Nutzer-Switcher: passwortloser Identitätswechsel — jetzt auch in Prod, aber
 * NUR für eingeloggte Admins (früher hart auf NODE_ENV=development gegated).
 *
 * Der Wechsel läuft über die service-role Admin-API: generateLink(magiclink)
 * liefert ein hashed_token, das der cookie-gebundene Auth-Client per verifyOtp
 * einlöst — @supabase/ssr schreibt denselben httpOnly-Session-Cookie-Satz wie
 * der echte /api/auth/login-Flow. Die Ziel-Identität ist eine vollwertige
 * Session (Board-Kommentare, Zuweisungen, Realtime wie bei echtem Login).
 * Auf self-hosted/cloud Supabase versendet generateLink KEINE Mail — es gibt
 * nur den Token zurück.
 *
 * Autorisierung (authorize()): erlaubt, wenn die aktive Session ein Admin ist
 * ODER ein gültiger, signierter Herkunfts-Cookie belegt, dass ein Admin die
 * Impersonation gestartet hat (siehe lib/server/auth/impersonation.ts). Das
 * hält den Switcher auch dann nutzbar, wenn ein Admin gerade als Member agiert
 * — sonst wäre der Wechsel eine Einbahnstraße.
 */

async function authorize(): Promise<{ ok: true; originAdminId: string } | { ok: false }> {
  // Herkunfts-Cookie hat Vorrang → der ursprüngliche Admin bleibt auch über
  // Admin→Admin-Wechsel hinweg stabil („Zurück zu mir" zielt auf den Start).
  const store = await cookies();
  const cookieOrigin = readImpersonationOrigin(store.get(IMPERSONATION_COOKIE)?.value);
  if (cookieOrigin) {
    const [row] = await db.select().from(users).where(eq(users.id, cookieOrigin)).limit(1);
    if (row && row.role === 'admin' && !row.disabledAt) {
      return { ok: true, originAdminId: cookieOrigin };
    }
  }
  const current = await getCurrentUser();
  if (current?.role === 'admin') return { ok: true, originAdminId: current.id };
  return { ok: false };
}

// GET: Auswahlliste für den Switcher (alle Konten, inkl. deaktivierter —
// so lässt sich auch der Ausgeloggt-/Gesperrt-Zustand testen) + der Herkunfts-
// Admin, damit die UI „Zurück zu mir" anbieten kann.
export const GET = withApiError(async () => {
  const auth = await authorize();
  if (!auth.ok) return apiError('Nur für Admins.', 403);
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
  return NextResponse.json({
    users: rows.map((r) => ({ ...r, role: r.role as UserRole })),
    originAdminId: auth.originAdminId,
  });
});

// POST { userId }: Session für diesen Nutzer setzen.
export const POST = withApiError(async (req: NextRequest) => {
  const auth = await authorize();
  if (!auth.ok) return apiError('Nur für Admins.', 403);

  const body = (await req.json().catch(() => ({}))) as { userId?: string };
  const userId = body.userId;
  if (!userId) return apiError('userId fehlt.', 400);

  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) return apiError('Unbekannter Nutzer.', 404);
  // Deaktivierte Konten sind auth-seitig gebannt — verifyOtp scheitert; früh raus.
  if (row.disabledAt) return apiError('Dieses Konto ist deaktiviert.', 409);

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: row.email,
  });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    return apiError('Magiclink-Erzeugung fehlgeschlagen.', 500);
  }

  // verifyOtp auf dem cookie-gebundenen Client -> setzt die Session-Cookies
  // in die Response (setAll in client.ts).
  const supabase = await getSupabaseAuthClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'email',
  });
  if (verifyError) {
    return apiError('Session konnte nicht gesetzt werden.', 500);
  }

  // Herkunfts-Cookie pflegen: beim Wechsel zurück zum Start-Admin löschen,
  // sonst (Impersonation aktiv) den signierten Herkunfts-Admin festhalten.
  const store = await cookies();
  if (row.id === auth.originAdminId) {
    store.delete(IMPERSONATION_COOKIE);
  } else {
    store.set(IMPERSONATION_COOKIE, signImpersonationOrigin(auth.originAdminId), {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
  }
  // Audit-Spur (Coolify/Vercel-Logs): wer agiert als wer.
  console.log(`[user-switcher] admin ${auth.originAdminId} -> acting as ${row.id} <${row.email}>`);

  return NextResponse.json({
    ok: true,
    user: {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      role: row.role as UserRole,
    },
  });
});
