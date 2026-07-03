import { describe, it, expect } from 'vitest';
import { validateUserPatch } from './admin';

// Pure Guard der PATCH-Route: Selbst-Deaktivierung und Entmachtung des
// letzten aktiven Admins sind die beiden Invarianten, die die
// Nutzerverwaltung dauerhaft bedienbar halten.

const ADMIN_A = '00000000-0000-4000-8000-00000000000a';
const ADMIN_B = '00000000-0000-4000-8000-00000000000b';
const MEMBER = '00000000-0000-4000-8000-0000000000c1';

const activeAdmin = (id: string) => ({ id, role: 'admin', disabledAt: null });
const activeMember = (id: string) => ({ id, role: 'member', disabledAt: null });

describe('validateUserPatch', () => {
  it('blocks self-deactivation', () => {
    expect(
      validateUserPatch({
        actorId: ADMIN_A,
        target: activeAdmin(ADMIN_A),
        patch: { disabled: true },
        activeAdminCount: 3,
      }),
    ).toMatch(/eigenes Konto/);
  });

  it('blocks demoting or deactivating the last active admin', () => {
    for (const patch of [{ role: 'member' as const }, { disabled: true }]) {
      expect(
        validateUserPatch({
          actorId: ADMIN_B,
          target: activeAdmin(ADMIN_A),
          patch,
          activeAdminCount: 1,
        }),
      ).toMatch(/letzte aktive Admin/);
    }
  });

  it('allows demoting an admin while another active admin remains', () => {
    expect(
      validateUserPatch({
        actorId: ADMIN_B,
        target: activeAdmin(ADMIN_A),
        patch: { role: 'member' },
        activeAdminCount: 2,
      }),
    ).toBeNull();
  });

  it('allows deactivating members regardless of admin count', () => {
    expect(
      validateUserPatch({
        actorId: ADMIN_A,
        target: activeMember(MEMBER),
        patch: { disabled: true },
        activeAdminCount: 1,
      }),
    ).toBeNull();
  });

  it('allows demoting an already-disabled admin (zählt nicht als aktiver Admin)', () => {
    expect(
      validateUserPatch({
        actorId: ADMIN_A,
        target: { id: ADMIN_B, role: 'admin', disabledAt: '2026-07-01T00:00:00Z' },
        patch: { role: 'member' },
        activeAdminCount: 1,
      }),
    ).toBeNull();
  });

  it('allows reactivation and promotion', () => {
    expect(
      validateUserPatch({
        actorId: ADMIN_A,
        target: { id: MEMBER, role: 'member', disabledAt: '2026-07-01T00:00:00Z' },
        patch: { disabled: false },
        activeAdminCount: 1,
      }),
    ).toBeNull();
    expect(
      validateUserPatch({
        actorId: ADMIN_A,
        target: activeMember(MEMBER),
        patch: { role: 'admin' },
        activeAdminCount: 1,
      }),
    ).toBeNull();
  });
});
