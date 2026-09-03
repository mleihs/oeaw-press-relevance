import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Login-Route (Supabase-Identität HINTER dem Gate) mit gemockter Auth-/DB-
// Schicht: kaputter Body → 400, falsche Credentials → 401, gebanntes Konto →
// 403, Erfolg → User + Gate-Cookie (zweite Verteidigungslinie disabled_at
// wirft die frische Session sofort wieder weg).

const signInWithPassword = vi.fn();
const signOut = vi.fn(async () => {});
vi.mock('@/lib/server/auth/client', () => ({
  getSupabaseAuthClient: async () => ({ auth: { signInWithPassword, signOut } }),
}));

const cookieDelete = vi.fn();
vi.mock('next/headers', () => ({
  cookies: async () => ({ delete: cookieDelete }),
}));

// users-Zeile der zweiten Verteidigungslinie (db.select…limit(1)).
let userRows: unknown[] = [];
vi.mock('@/lib/server/db', async () => {
  const schema = await import('@/lib/server/db/schema');
  return {
    ...schema,
    db: {
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => userRows }) }),
      }),
    },
  };
});

const { POST } = await import('./route');

const post = (body: unknown) =>
  new NextRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      'x-forwarded-for': '203.0.113.60',
    },
    body: JSON.stringify(body),
  });

const USER_ID = '11111111-2222-3333-4444-555555555555';

beforeEach(() => {
  vi.clearAllMocks();
  userRows = [];
  process.env.GATE_TOKEN = 'gate-token-aus-env';
});

afterEach(() => {
  delete process.env.GATE_TOKEN;
});

describe('POST /api/auth/login', () => {
  it('ungültige E-Mail im Body → 400, ohne Supabase überhaupt zu fragen', async () => {
    const res = await POST(post({ email: 'keine-mail', password: 'x' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Bitte eine gültige E-Mail-Adresse angeben.');
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('fehlendes Passwort → 400', async () => {
    const res = await POST(post({ email: 'a@oeaw.ac.at', password: '' }));
    expect(res.status).toBe(400);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('falsche Credentials → 401 mit neutraler Meldung', async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: 'invalid_credentials' },
    });
    const res = await POST(post({ email: 'a@oeaw.ac.at', password: 'falsch' }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('E-Mail oder Passwort ist nicht korrekt.');
  });

  it('gebanntes Konto → 403 mit dem echten Grund', async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: 'user_banned' },
    });
    const res = await POST(post({ email: 'a@oeaw.ac.at', password: 'x' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Dieses Konto ist deaktiviert.');
  });

  it('Auth ok, aber disabled_at gesetzt → 403 UND Session sofort beendet', async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    userRows = [
      {
        id: USER_ID,
        email: 'a@oeaw.ac.at',
        displayName: 'A',
        role: 'member',
        disabledAt: '2026-08-01T00:00:00.000Z',
      },
    ];
    const res = await POST(post({ email: 'a@oeaw.ac.at', password: 'x' }));
    expect(res.status).toBe(403);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('Auth ok ohne users-Zeile → 401 (Konto existiert nicht mehr) + signOut', async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    userRows = [];
    const res = await POST(post({ email: 'a@oeaw.ac.at', password: 'x' }));
    expect(res.status).toBe(401);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('Erfolg → 200 mit User, Gate-Cookie = GATE_TOKEN, Impersonation-Cookie geräumt', async () => {
    signInWithPassword.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    userRows = [
      {
        id: USER_ID,
        email: 'a@oeaw.ac.at',
        displayName: 'A',
        role: 'member',
        disabledAt: null,
      },
    ];
    const res = await POST(post({ email: 'a@oeaw.ac.at', password: 'richtig' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.user).toEqual({
      id: USER_ID,
      email: 'a@oeaw.ac.at',
      displayName: 'A',
      role: 'member',
    });
    // Gate-Cookie trägt GATE_TOKEN (nicht tokenize(GATE_PASSWORD) — Env-Drift-Fix).
    expect(res.headers.get('set-cookie')).toContain('gate=gate-token-aus-env');
    // Alte Switcher-Herkunft wird beim frischen Login zurückgesetzt.
    expect(cookieDelete).toHaveBeenCalledWith('imp_origin');
  });
});
