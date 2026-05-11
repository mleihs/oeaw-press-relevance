import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client. Reads URL+key from env exclusively — clients
 * cannot inject their own (B2 fix). For local dev set SUPABASE_URL and
 * SUPABASE_ANON_KEY in .env.local. The legacy NEXT_PUBLIC_* variants are
 * still accepted as a fallback to avoid breaking existing deployments.
 *
 * Supabase-JS keeps Auth / Realtime / Storage / RPC; Drizzle (also exported
 * from this folder) handles plain SELECT / INSERT / UPDATE / DELETE.
 */
export function getSupabaseFromRequest(_req: NextRequest) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) {
    throw new Error(
      'Supabase credentials not configured (set SUPABASE_URL + SUPABASE_ANON_KEY in env)',
    );
  }
  return createClient(url, key);
}

/**
 * Server-side admin client. Uses SUPABASE_SERVICE_ROLE_KEY which bypasses
 * RLS. Only mutating server routes (analysis batch, enrichment batch, CSV
 * import) should use this. Reads should keep using getSupabaseFromRequest
 * (anon).
 */
export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY not configured (mutating routes need it after RLS lockdown)',
    );
  }
  return createClient(url, serviceKey);
}
