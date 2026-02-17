import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;
let cachedUrl = '';
let cachedKey = '';

export function getSupabaseClient(url?: string, anonKey?: string): SupabaseClient {
  const supabaseUrl = url || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = anonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL and anon key are required. Set them in environment variables or settings.');
  }

  if (cachedClient && cachedUrl === supabaseUrl && cachedKey === supabaseAnonKey) {
    return cachedClient;
  }

  cachedClient = createClient(supabaseUrl, supabaseAnonKey);
  cachedUrl = supabaseUrl;
  cachedKey = supabaseAnonKey;
  return cachedClient;
}

export function createServerClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey);
}
