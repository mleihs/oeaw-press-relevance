import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

/**
 * RLS-/Auth-Smoke gegen den LOKALEN Supabase-Stack (BOARD_PLAN.md §5
 * Phase 1: „anon darf nichts auf Board-Tabellen"). Integrationstest mit
 * echtem Auth-Server:
 *
 *   1. Admin-API legt einen Wegwerf-Nutzer an → der Trigger
 *      on_auth_user_created muss die public.users-Zeile spiegeln.
 *   2. anon sieht über PostgREST NICHTS von users/user_settings (RLS).
 *   3. Der eingeloggte Nutzer (authenticated) sieht users — die
 *      authenticated_select-Policy, auf der Phase-2/Realtime aufbaut.
 *   4. Ein deaktivierter (gebannter) Nutzer kann sich nicht anmelden.
 *
 * Läuft nur, wenn der lokale Stack erreichbar ist UND die URL auf
 * localhost zeigt (Schutz: niemals Wegwerf-Nutzer in prod anlegen).
 * In CI ohne Stack wird die Suite sauber geskippt.
 */

function loadLocalEnv(): Record<string, string> {
  const merged: Record<string, string> = {};
  try {
    const txt = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) merged[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  } catch {
    // kein .env.local (CI) — nur process.env verwenden
  }
  for (const k of Object.keys(process.env)) {
    if (process.env[k]) merged[k] = process.env[k] as string;
  }
  return merged;
}

const env = loadLocalEnv();
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
const anonKey = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';

const isLocalTarget = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url);

async function stackReachable(): Promise<boolean> {
  if (!isLocalTarget || !anonKey || !serviceKey) return false;
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(2_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const available = await stackReachable();

describe.skipIf(!available)('RLS smoke (lokaler Supabase-Stack)', () => {
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const suffix = Math.random().toString(36).slice(2, 10);
  const email = `rls-smoke-${suffix}@example.com`;
  const password = `smoke-${suffix}-Aa23456789`;
  let userId: string | null = null;

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it('createUser spiegelt via Trigger nach public.users (role aus app_metadata)', async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: 'RLS Smoke' },
      app_metadata: { role: 'member' },
    });
    expect(error).toBeNull();
    userId = data.user!.id;

    const { data: rows, error: selErr } = await admin
      .from('users')
      .select('id, email, display_name, role, disabled_at')
      .eq('id', userId);
    expect(selErr).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows![0]).toMatchObject({
      email,
      display_name: 'RLS Smoke',
      role: 'member',
      disabled_at: null,
    });
  });

  it('anon sieht weder users noch user_settings', async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const usersRes = await anon.from('users').select('id');
    expect(usersRes.error).toBeNull();
    expect(usersRes.data).toEqual([]);
    const settingsRes = await anon.from('user_settings').select('user_id');
    expect(settingsRes.error).toBeNull();
    expect(settingsRes.data).toEqual([]);
  });

  it('authenticated sieht users (authenticated_select-Policy)', async () => {
    const client = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
    expect(signInErr).toBeNull();

    const { data, error } = await client.from('users').select('id').eq('id', userId!);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    // Schreiben bleibt trotzdem verboten (keine INSERT/UPDATE-Policies).
    const { error: updErr } = await client
      .from('users')
      .update({ role: 'admin' })
      .eq('id', userId!)
      .select();
    // PostgREST liefert bei RLS-verweigertem UPDATE 0 Zeilen oder einen
    // expliziten Fehler — beides heißt: nicht durchgekommen.
    const { data: after } = await admin.from('users').select('role').eq('id', userId!);
    expect(updErr === null ? after![0].role : 'member').toBe('member');

    await client.auth.signOut();
  });

  it('gebannte (deaktivierte) Nutzer können sich nicht anmelden', async () => {
    const { error: banErr } = await admin.auth.admin.updateUserById(userId!, {
      ban_duration: '87600h',
    });
    expect(banErr).toBeNull();

    const client = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error } = await client.auth.signInWithPassword({ email, password });
    expect(error).not.toBeNull();
  });

  it('deleteUser räumt die public.users-Zeile mit ab (FK CASCADE)', async () => {
    const id = userId!;
    const { error } = await admin.auth.admin.deleteUser(id);
    expect(error).toBeNull();
    userId = null;
    const { data } = await admin.from('users').select('id').eq('id', id);
    expect(data).toEqual([]);
  });

  // Regression 2026-07-03: GoTrue merged custom app_metadata erst NACH dem
  // INSERT — der Spiegel-Trigger sieht die Rolle nie, createAdminUser muss
  // sie explizit setzen. Hier läuft der ECHTE App-Pfad (lib/server/auth/
  // admin.ts) gegen den lokalen Stack.
  it('createAdminUser legt Admins wirklich als admin an (nicht member)', async () => {
    process.env.DATABASE_URL = env.DATABASE_URL;
    process.env.SUPABASE_URL = url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
    const { createAdminUser } = await import('./admin');

    const created = await createAdminUser({
      email: `rls-smoke-admin-${suffix}@example.com`,
      password: `smoke-${suffix}-Bb23456789`,
      displayName: 'RLS Smoke Admin',
      role: 'admin',
    });
    try {
      expect(created.role).toBe('admin');
      const { data } = await admin.from('users').select('role').eq('id', created.id);
      expect(data![0].role).toBe('admin');
    } finally {
      await admin.auth.admin.deleteUser(created.id);
    }
  });
});

// Sichtbarer Hinweis statt stillem Grün, wenn der Stack fehlt.
describe.runIf(!available)('RLS smoke (geskippt)', () => {
  it.skip('lokaler Supabase-Stack nicht erreichbar oder URL nicht lokal — Suite geskippt', () => {});
});
