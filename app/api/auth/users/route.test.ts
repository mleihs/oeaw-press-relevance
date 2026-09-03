import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Nutzerverwaltung (admin-only): ohne Session muss requireAdmin über den
// echten require.ts-Pfad in eine strukturierte 401 laufen (ApiAuthError →
// withApiError), eine Member-Session in 403 — nie in die 500-Fallthrough.
// Gemockt wird nur die Supabase-Auth-Grenze + die users-Zeile.

const getUser = vi.fn();
vi.mock('@/lib/server/auth/client', () => ({
  getSupabaseAuthClient: async () => ({ auth: { getUser } }),
}));

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

const listAdminUsers = vi.fn(async () => [{ id: 'u1' }]);
const createAdminUser = vi.fn(async (_payload: unknown) => ({ id: 'u2' }));
vi.mock('@/lib/server/auth/admin', () => ({
  listAdminUsers: () => listAdminUsers(),
  createAdminUser: (p: unknown) => createAdminUser(p),
}));

const { GET, POST } = await import('./route');

const USER_ID = '11111111-2222-3333-4444-555555555555';

const postReq = (body: unknown) =>
  new NextRequest('http://localhost:3000/api/auth/users', {
    method: 'POST',
    headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  userRows = [];
  getUser.mockResolvedValue({ data: { user: null }, error: null });
});

describe('GET /api/auth/users', () => {
  it('ohne Session → 401, die Nutzerliste wird nie geladen', async () => {
    const res = await GET();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Nicht angemeldet.');
    expect(listAdminUsers).not.toHaveBeenCalled();
  });

  it('Member-Session → 403 (Nur für Admins)', async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    userRows = [
      { id: USER_ID, email: 'm@oeaw.ac.at', displayName: 'M', role: 'member', disabledAt: null },
    ];
    const res = await GET();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Nur für Admins.');
    expect(listAdminUsers).not.toHaveBeenCalled();
  });

  it('Admin-Session → 200 mit Nutzerliste', async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    userRows = [
      { id: USER_ID, email: 'a@oeaw.ac.at', displayName: 'A', role: 'admin', disabledAt: null },
    ];
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ users: [{ id: 'u1' }] });
  });
});

describe('POST /api/auth/users', () => {
  it('ohne Session → 401 VOR jeder Body-Validierung/Anlage', async () => {
    const res = await POST(postReq({ was: 'auch immer' }));
    expect(res.status).toBe(401);
    expect(createAdminUser).not.toHaveBeenCalled();
  });

  it('Admin mit kaputtem Body → 400, ohne Anlage', async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    userRows = [
      { id: USER_ID, email: 'a@oeaw.ac.at', displayName: 'A', role: 'admin', disabledAt: null },
    ];
    const res = await POST(postReq({ email: 'keine-mail' }));
    expect(res.status).toBe(400);
    expect(createAdminUser).not.toHaveBeenCalled();
  });
});
