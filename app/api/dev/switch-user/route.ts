import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { apiError, validateBody, withApiError } from '@/lib/server/http';
import { db, users, getSupabaseAdmin } from '@/lib/server/db';
import { getSupabaseAuthClient } from '@/lib/server/auth/client';
import {
  IMPERSONATION_COOKIE,
  signImpersonationOrigin,
} from '@/lib/server/auth/impersonation';
import {
  authorizeUserSwitch,
  listSwitchableUsers,
} from '@/lib/server/auth/user-switcher';
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
 * Autorisierung + Auswahlliste liegen in lib/server/auth/user-switcher.ts; die
 * Session-Cookie-Machinerie (verifyOtp + Herkunfts-Cookie) bleibt hier, weil
 * sie request/response-gebunden ist.
 */

// GET: Auswahlliste für den Switcher + der Herkunfts-Admin, damit die UI
// „Zurück zu mir" anbieten kann.
export const GET = withApiError(async () => {
  const auth = await authorizeUserSwitch();
  if (!auth.ok) return apiError('Nur für Admins.', 403);
  return NextResponse.json({
    users: await listSwitchableUsers(),
    originAdminId: auth.originAdminId,
  });
});

// POST-Body-Schema. UUID-Prüfung als pg-Semantik-Regex (8-4-4-4-12 Hex) statt
// z.uuid() — dieselbe Begründung wie idParamSchema in lib/server/schemas.ts:
// MT-importierte Ids sind gültige Postgres-uuids ohne RFC-Versions-Bits. Ohne
// Prüfung würde ein Nicht-UUID-Wert erst in Postgres scheitern (500 +
// Sentry-Rauschen statt sauberem 400).
const switchUserPayloadSchema = z.object({
  userId: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'userId muss eine UUID sein.'),
});

// POST { userId }: Session für diesen Nutzer setzen.
export const POST = withApiError(async (req: NextRequest) => {
  const auth = await authorizeUserSwitch();
  if (!auth.ok) return apiError('Nur für Admins.', 403);

  const { userId } = await validateBody(req, switchUserPayloadSchema);

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
  // Audit-Spur (Coolify/Vercel-Logs): wer agiert als wer. Zusätzlich als
  // Sentry-Breadcrumb, damit die Impersonation an späteren Fehler-Events
  // hängt (kein DB-Audit-Table — bewusst klein gehalten).
  console.log(`[user-switcher] admin ${auth.originAdminId} -> acting as ${row.id} <${row.email}>`);
  Sentry.addBreadcrumb({
    category: 'auth.impersonation',
    message: `admin ${auth.originAdminId} -> acting as ${row.id}`,
    level: 'info',
    data: { originAdminId: auth.originAdminId, targetUserId: row.id },
  });

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
