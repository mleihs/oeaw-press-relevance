import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, DELETE } from './route';

// Gate-Route (äußere Hülle vor der Supabase-Identität): kaputter Body → 400
// via validateBody/withApiError, falsches Passwort → 401, korrektes → Cookie.
// Der CSRF-Guard von withApiError läuft mit — die Requests tragen deshalb
// Origin+Host wie ein echter Browser-POST.

const GATE_PASSWORD = 'korrekt-und-geheim';

const post = (body: string | null, headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost:3000/api/auth/gate', {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      'x-forwarded-for': '203.0.113.50',
      ...headers,
    },
    ...(body === null ? {} : { body }),
  });

beforeEach(() => {
  process.env.GATE_PASSWORD = GATE_PASSWORD;
});

afterEach(() => {
  delete process.env.GATE_PASSWORD;
});

describe('POST /api/auth/gate', () => {
  it('fehlendes password im Body → 400 mit Zod-Meldung (kein 500)', async () => {
    const res = await POST(post(JSON.stringify({})));
    expect(res.status).toBe(400);
    expect(typeof (await res.json()).error).toBe('string');
  });

  it('leeres password → 400 mit der min(1)-Meldung', async () => {
    const res = await POST(post(JSON.stringify({ password: '' })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Password required');
  });

  it('Nicht-JSON-Body wird als {} behandelt → dieselbe 400 (kein 500)', async () => {
    const res = await POST(post('kein json'));
    expect(res.status).toBe(400);
    expect(typeof (await res.json()).error).toBe('string');
  });

  it('falsches Passwort → 401 ohne Cookie', async () => {
    const res = await POST(post(JSON.stringify({ password: 'falsch' })));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Invalid password');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('korrektes Passwort → 200 + HttpOnly-Gate-Cookie (Token, nie das Passwort)', async () => {
    const res = await POST(post(JSON.stringify({ password: GATE_PASSWORD })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('gate=');
    expect(cookie).toContain('HttpOnly');
    // Das Roh-Passwort darf NIE im Cookie-Jar landen (nur der SHA-256-Token).
    expect(cookie).not.toContain(GATE_PASSWORD);
  });

  it('Cross-Origin-POST → 403 durch den withApiError-CSRF-Guard', async () => {
    const res = await POST(
      post(JSON.stringify({ password: GATE_PASSWORD }), { origin: 'https://evil.example' }),
    );
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/auth/gate', () => {
  it('löscht das Gate-Cookie (expiriert)', async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('gate=;');
  });
});
