import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser-Supabase-Client — ausschließlich für Realtime (postgres_changes).
 *
 * Sicherheits-Posture (s. lib/server/auth/client.ts): Die Session-Cookies
 * bleiben httpOnly, dieser Client persistiert KEINE Session und refresht
 * nichts selbst. Er bekommt den kurzlebigen Access-Token über
 * `realtime.setAuth()` gereicht (Quelle: /api/auth/realtime-token). Der
 * anon-Key ist bewusst öffentlich (NEXT_PUBLIC_*); autorisiert wird jede
 * Subscription über RLS (`authenticated_select`), nicht über den anon-Key.
 *
 * Singleton: genau ein WebSocket pro Tab, egal wie viele Board-Views mounten.
 */
let cached: SupabaseClient | null = null;

export function getRealtimeClient(): SupabaseClient | null {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  cached = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: {
      // Board-Traffic ist niedrig (10 Nutzer); der Default reicht, wir
      // deckeln nur gegen versehentliche Event-Stürme.
      params: { eventsPerSecond: 5 },
    },
  });
  return cached;
}
