import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { apiError, validateBody, withApiError } from '@/lib/server/http';
import { loginPayloadSchema } from '@/lib/shared/schemas';
import { createRateLimiter, getClientIp } from '@/lib/server/rate-limit';
import { getSupabaseAuthClient } from '@/lib/server/auth/client';
import { evaluateUserRow } from '@/lib/server/auth/require';
import { IMPERSONATION_COOKIE } from '@/lib/server/auth/impersonation';
import { db, users } from '@/lib/server/db';
import { eq } from 'drizzle-orm';
import { GATE_COOKIE_OPTIONS } from '@/lib/server/gate';
import { GATE_COOKIE_NAME } from '@/lib/shared/gate';

// Supabase-Auth-Login (Identität HINTER dem Passwort-Gate — das Gate
// bleibt die äußere Hülle, s. BOARD_PLAN.md §3.1). Muster wie
// /api/auth/gate: Rate-Limit zuerst, dann Validierung, dann Prüfung.
// Die Session landet als httpOnly-Cookie-Satz im Response (client.ts).

const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 60_000 });

export const POST = withApiError(async (req: NextRequest) => {
  const ip = getClientIp(req);
  if (limiter.isBlocked(ip)) {
    return apiError('Zu viele Anmeldeversuche. Bitte in 1 Minute erneut versuchen.', 429);
  }

  const { email, password } = await validateBody(req, loginPayloadSchema);

  const supabase = await getSupabaseAuthClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    // Deaktivierte Konten sind auth-seitig gebannt — dem Nutzer den echten
    // Grund sagen statt „Passwort falsch" (kein Enumerations-Risiko: die
    // Person kennt ihr Konto ja).
    if (error?.code === 'user_banned') {
      return apiError('Dieses Konto ist deaktiviert.', 403);
    }
    limiter.recordFailure(ip);
    return apiError('E-Mail oder Passwort ist nicht korrekt.', 401);
  }

  // Zweite Verteidigungslinie: disabled_at in public.users (falls der Ban
  // beim Deaktivieren fehlschlug) — Session sofort wieder wegwerfen.
  const [row] = await db.select().from(users).where(eq(users.id, data.user.id)).limit(1);
  const result = evaluateUserRow(row ?? null);
  if (!result.ok) {
    await supabase.auth.signOut();
    return apiError(result.message, result.status);
  }

  limiter.reset(ip);
  // Frischer echter Login setzt den Impersonation-Zustand zurück (falls ein
  // Herkunfts-Cookie aus einer alten Switcher-Sitzung übrig war).
  (await cookies()).delete(IMPERSONATION_COOKIE);
  const res = NextResponse.json({ ok: true, user: result.user });
  // Persönlicher Login ist strikt stärker als das gemeinsame Übergangs-
  // Passwort: das Gate-Cookie wird mitgesetzt, damit der vereinheitlichte
  // Anmelde-Screen (AuthScreen am Gate) mit einem Schritt durchkommt.
  // Cookie-Wert = GATE_TOKEN (genau der Wert, gegen den der Proxy vergleicht)
  // statt tokenize(GATE_PASSWORD): sonst sperrt eine Env-Drift zwischen den
  // beiden Variablen jeden persönlichen Login in eine Redirect-Schleife
  // (Review-Fund). GATE_TOKEN ist per env-Validator garantiert.
  res.cookies.set(GATE_COOKIE_NAME, process.env.GATE_TOKEN!, GATE_COOKIE_OPTIONS);
  return res;
});
