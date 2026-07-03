import { NextResponse } from 'next/server';
import { apiError, withApiError } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth/require';
import { getSupabaseAuthClient } from '@/lib/server/auth/client';

export const dynamic = 'force-dynamic';

// Access-Token für den Browser-Realtime-Client (BOARD_PLAN.md §3.2 /
// Phase 3). Die Session-Cookies bleiben httpOnly (client.ts) — Realtime
// braucht aber ein Bearer-JWT im Browser, deshalb reichen wir NUR den
// Access-Token (kurzlebig, ~1 h) über diesen Endpoint heraus, nie den
// Refresh-Token. `requireUser()` validiert die Session gegen den
// Auth-Server (getUser refresht dabei abgelaufene Cookies) und sperrt
// deaktivierte Konten aus; erst danach lesen wir den frischen Token.
export const GET = withApiError(async () => {
  await requireUser();

  const supabase = await getSupabaseAuthClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    return apiError('Keine aktive Sitzung.', 401);
  }

  return NextResponse.json({
    token: data.session.access_token,
    // Unix-Sekunden (Supabase-Konvention); der Client plant daraus den
    // Vorab-Refresh, bevor das JWT abläuft.
    expiresAt: data.session.expires_at ?? null,
  });
});
