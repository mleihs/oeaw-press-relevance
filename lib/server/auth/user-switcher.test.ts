import { describe, it, expect, vi, beforeEach } from 'vitest';

// Autorisierung des Nutzer-Switchers: der signierte Herkunfts-Cookie hat
// Vorrang (hält den Switcher während einer Admin→Member-Impersonation nutzbar),
// sonst zählt die aktive Admin-Session. Gemockt: Cookie-Store, DB-Zeile,
// getCurrentUser — die Cookie-Signatur läuft ECHT durch impersonation.ts.

let cookieValue: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'imp_origin' && cookieValue !== undefined
        ? { name, value: cookieValue }
        : undefined,
  }),
}));

let dbRows: unknown[] = [];
const orderByRows = vi.fn(async () => dbRows);
vi.mock('@/lib/server/db', async () => {
  const schema = await import('@/lib/server/db/schema');
  return {
    ...schema,
    db: {
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => dbRows }),
          orderBy: orderByRows,
        }),
      }),
    },
  };
});

const getCurrentUser = vi.fn();
vi.mock('@/lib/server/auth/require', () => ({
  getCurrentUser: () => getCurrentUser(),
}));

process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-fuer-tests';
const { signImpersonationOrigin } = await import('./impersonation');
const { authorizeUserSwitch, listSwitchableUsers } = await import('./user-switcher');

const ADMIN_ID = '11111111-2222-3333-4444-555555555555';
const adminRow = { id: ADMIN_ID, role: 'admin', disabledAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  cookieValue = undefined;
  dbRows = [];
  getCurrentUser.mockResolvedValue(null);
});

describe('authorizeUserSwitch', () => {
  it('gültiger Herkunfts-Cookie eines aktiven Admins → ok, auch wenn die Session Member ist', async () => {
    cookieValue = signImpersonationOrigin(ADMIN_ID);
    dbRows = [adminRow];
    getCurrentUser.mockResolvedValue({ id: 'member-id', role: 'member' });
    expect(await authorizeUserSwitch()).toEqual({ ok: true, originAdminId: ADMIN_ID });
    // Der Cookie hat Vorrang — die Session muss gar nicht befragt werden.
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it('gefälschter Cookie (kaputte MAC) wird ignoriert → Fallback auf die Session', async () => {
    const forged = `${ADMIN_ID}.${'0'.repeat(64)}`;
    cookieValue = forged;
    dbRows = [adminRow]; // dürfte nie befragt werden — MAC fällt vorher durch
    getCurrentUser.mockResolvedValue(null);
    expect(await authorizeUserSwitch()).toEqual({ ok: false });
  });

  it('Cookie auf deaktivierten/degradierten Admin → zählt nicht; Member-Session → not ok', async () => {
    cookieValue = signImpersonationOrigin(ADMIN_ID);
    dbRows = [{ ...adminRow, disabledAt: '2026-08-01T00:00:00.000Z' }];
    getCurrentUser.mockResolvedValue({ id: 'member-id', role: 'member' });
    expect(await authorizeUserSwitch()).toEqual({ ok: false });
  });

  it('Cookie auf Ex-Admin (role=member) → zählt nicht', async () => {
    cookieValue = signImpersonationOrigin(ADMIN_ID);
    dbRows = [{ ...adminRow, role: 'member' }];
    expect(await authorizeUserSwitch()).toEqual({ ok: false });
  });

  it('ohne Cookie: aktive Admin-Session → ok mit der eigenen Id', async () => {
    getCurrentUser.mockResolvedValue({ id: ADMIN_ID, role: 'admin' });
    expect(await authorizeUserSwitch()).toEqual({ ok: true, originAdminId: ADMIN_ID });
  });

  it('ohne Cookie und ohne Session → not ok', async () => {
    expect(await authorizeUserSwitch()).toEqual({ ok: false });
  });
});

describe('listSwitchableUsers', () => {
  it('liefert alle Konten (inkl. deaktivierter) mit typisierter Rolle', async () => {
    dbRows = [
      { id: 'a', email: 'a@x', displayName: 'A', role: 'admin', disabledAt: null },
      { id: 'b', email: 'b@x', displayName: 'B', role: 'member', disabledAt: '2026-08-01' },
    ];
    const users = await listSwitchableUsers();
    expect(users).toHaveLength(2);
    expect(users[1].role).toBe('member');
    expect(users[1].disabledAt).toBe('2026-08-01');
  });
});
