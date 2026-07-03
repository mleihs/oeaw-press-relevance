import { describe, it, expect } from 'vitest';
import { evaluateUserRow, evaluateAdmin } from './require';

// Die pure Kernlogik hinter requireUser()/requireAdmin(). Die IO-Wrapper
// (Cookies → getUser → users-Zeile) deckt der RLS-/Auth-Smoke-Test gegen
// den lokalen Stack ab (rls-smoke.test.ts).

type UserRow = NonNullable<Parameters<typeof evaluateUserRow>[0]>;

function row(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'test@oeaw.ac.at',
    displayName: 'Test Person',
    role: 'member',
    createdAt: '2026-07-03T10:00:00Z',
    updatedAt: '2026-07-03T10:00:00Z',
    disabledAt: null as string | null,
    ...overrides,
  };
}

describe('evaluateUserRow', () => {
  it('rejects missing rows as 401 (Session ohne Konto = nicht angemeldet)', () => {
    expect(evaluateUserRow(null)).toEqual({
      ok: false,
      status: 401,
      message: 'Nicht angemeldet.',
    });
    expect(evaluateUserRow(undefined).ok).toBe(false);
  });

  it('rejects disabled accounts as 403 — auch mit noch gültigem JWT', () => {
    const result = evaluateUserRow(row({ disabledAt: '2026-07-01T00:00:00Z' }));
    expect(result).toEqual({
      ok: false,
      status: 403,
      message: 'Dieses Konto ist deaktiviert.',
    });
  });

  it('maps an active row to CurrentUser', () => {
    const result = evaluateUserRow(row());
    expect(result).toEqual({
      ok: true,
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        email: 'test@oeaw.ac.at',
        displayName: 'Test Person',
        role: 'member',
      },
    });
  });
});

describe('evaluateAdmin', () => {
  it('passes admins through unchanged', () => {
    const result = evaluateAdmin(evaluateUserRow(row({ role: 'admin' })));
    expect(result.ok).toBe(true);
  });

  it('rejects members as 403', () => {
    const result = evaluateAdmin(evaluateUserRow(row()));
    expect(result).toEqual({ ok: false, status: 403, message: 'Nur für Admins.' });
  });

  it('keeps the underlying 401/403 for missing or disabled accounts', () => {
    expect(evaluateAdmin(evaluateUserRow(null))).toMatchObject({ ok: false, status: 401 });
    expect(
      evaluateAdmin(evaluateUserRow(row({ role: 'admin', disabledAt: '2026-07-01T00:00:00Z' }))),
    ).toMatchObject({ ok: false, status: 403, message: 'Dieses Konto ist deaktiviert.' });
  });
});
