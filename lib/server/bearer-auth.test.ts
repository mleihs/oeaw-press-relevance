import { describe, it, expect } from 'vitest';
import { createBearerGuard, type NamedSecret } from './bearer-auth';

// Der gemeinsame Guard mit mehreren benannten Secrets (TYPO3-Bridge). Der
// Einzel-Secret-Fall (Nacht-Cron) steht in lib/server/ingest/cron-auth.test.ts.

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

function req(auth?: string): Request {
  return new Request('http://localhost/x', { headers: auth ? { authorization: auth } : {} });
}

function guardWith(secrets: NamedSecret[]) {
  return createBearerGuard({ secrets: () => secrets, notConfigured: 'aus' });
}

describe('createBearerGuard mit benannten Secrets', () => {
  it('check nennt den Namen des passenden Secrets', () => {
    const g = guardWith([
      { label: 'eins', secret: A },
      { label: 'zwei', secret: B },
    ]);
    expect(g.check(req(`Bearer ${A}`))).toEqual({ ok: true, label: 'eins' });
    expect(g.check(req(`Bearer ${B}`))).toEqual({ ok: true, label: 'zwei' });
    expect(g.assert(req(`Bearer ${B}`))).toBeNull();
  });

  it('falsches oder fehlendes Token: 401', () => {
    const g = guardWith([{ label: 'eins', secret: A }]);
    for (const r of [req('Bearer falsch'), req()]) {
      const c = g.check(r);
      expect(c.ok).toBe(false);
      if (!c.ok) expect(c.response.status).toBe(401);
    }
  });

  it('leere Liste oder nur Leerzeichen: 503', () => {
    for (const secrets of [[], [{ label: 'leer', secret: '   ' }]]) {
      const r = guardWith(secrets).assert(req(`Bearer ${A}`));
      expect(r?.status).toBe(503);
    }
  });

  it('Leerzeichen um ein Secret zählen nicht', () => {
    expect(guardWith([{ label: 'eins', secret: ` ${A}\n` }]).check(req(`Bearer ${A}`))).toEqual({ ok: true, label: 'eins' });
  });

  it('Einzel-Secret heißt „default“', () => {
    const g = createBearerGuard({ secret: () => A, notConfigured: 'aus' });
    expect(g.check(req(`Bearer ${A}`))).toEqual({ ok: true, label: 'default' });
  });
});
