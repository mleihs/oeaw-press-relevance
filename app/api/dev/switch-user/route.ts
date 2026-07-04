import { NextRequest, NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { apiError, withApiError } from '@/lib/server/http';
import { db, users, getSupabaseAdmin } from '@/lib/server/db';
import { getSupabaseAuthClient } from '@/lib/server/auth/client';
import type { UserRole } from '@/lib/shared/types';

export const dynamic = 'force-dynamic';

/**
 * NUR Entwicklung: passwortloser Identitätswechsel fürs Board-Testing.
 *
 * In Prod existiert diese Route effektiv nicht (404) — sie ist der einzige
 * Weg, ohne Passwort in eine fremde Session zu kommen, also bleibt sie hart
 * hinter NODE_ENV. Der Wechsel läuft über die service-role Admin-API:
 * generateLink(magiclink) liefert ein hashed_token, das der cookie-gebundene
 * Auth-Client (client.ts) per verifyOtp einlöst — dabei schreibt @supabase/ssr
 * denselben httpOnly-Session-Cookie-Satz wie der echte /api/auth/login-Flow.
 * Die neue Identität ist damit eine vollwertige Session (Board-Kommentare,
 * Zuweisungen, Realtime verhalten sich exakt wie bei echtem Login).
 */

const IS_PROD = process.env.NODE_ENV === 'production';

// GET: Auswahlliste für den Switcher (alle Konten, inkl. deaktivierter —
// so lässt sich auch der Ausgeloggt-/Gesperrt-Zustand testen).
export const GET = withApiError(async () => {
  if (IS_PROD) return apiError('Nicht gefunden.', 404);
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
  });
});

// POST { userId }: Session für diesen Nutzer setzen.
export const POST = withApiError(async (req: NextRequest) => {
  if (IS_PROD) return apiError('Nicht gefunden.', 404);

  const body = (await req.json().catch(() => ({}))) as { userId?: string };
  const userId = body.userId;
  if (!userId) return apiError('userId fehlt.', 400);

  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) return apiError('Unbekannter Nutzer.', 404);

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
