import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/**
 * Cookie-gebundener Supabase-Auth-Client (@supabase/ssr) für Route
 * Handlers und RSC. Ergänzt die beiden Clients in lib/server/db/supabase.ts:
 * dieser hier trägt die Session des eingeloggten Nutzers (Login, getUser,
 * Logout), während `getSupabaseAdmin()` (service-role) die Admin-API für
 * die Nutzerverwaltung bedient und Drizzle die Daten-Queries fährt.
 *
 * Sicherheits-Posture: Es gibt bewusst KEINEN Browser-Supabase-Client —
 * alle Auth-Flüsse laufen über /api/auth/* (Muster: Gate-Login). Deshalb
 * dürfen die Session-Cookies httpOnly sein (XSS kann die Session nicht
 * exfiltrieren) und sameSite strict (wie der Gate-Cookie). Wenn Phase 3
 * Realtime im Browser braucht, muss der Access-Token über einen eigenen
 * Endpoint gereicht werden — httpOnly dann NICHT aufweichen.
 *
 * Token-Refresh: `auth.getUser()` erneuert eine abgelaufene Session über
 * den Refresh-Token und schreibt neue Cookies via `setAll`. Das
 * funktioniert nur in Route Handlers (Cookies schreibbar); in RSC schluckt
 * der try/catch den Schreibversuch — der nächste API-Call refresht dann.
 */
export async function getSupabaseAuthClient() {
  const cookieStore = await cookies();
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) {
    throw new Error(
      'Supabase credentials not configured (set SUPABASE_URL + SUPABASE_ANON_KEY in env)',
    );
  }
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // RSC-Render: Cookies sind hier read-only. Kein Fehler — der
          // Refresh passiert beim nächsten Route-Handler-Aufruf.
        }
      },
    },
    cookieOptions: {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    },
  });
}
