import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { withApiError } from '@/lib/server/http';
import { getSupabaseAuthClient } from '@/lib/server/auth/client';
import { IMPERSONATION_COOKIE } from '@/lib/server/auth/impersonation';

// POST statt DELETE-auf-Login-Route: Logout ist eine eigene Aktion mit
// eigener Route; withApiError erzwingt den CSRF-Check auf POST.
export const POST = withApiError(async () => {
  const supabase = await getSupabaseAuthClient();
  // 'local' reicht: nur diese Session beenden (Standard wäre global —
  // würde die Person auch auf anderen Geräten abmelden).
  await supabase.auth.signOut({ scope: 'local' });
  // Impersonation-Herkunft mit beenden.
  (await cookies()).delete(IMPERSONATION_COOKIE);
  return NextResponse.json({ ok: true });
});
