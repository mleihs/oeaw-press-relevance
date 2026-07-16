import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { assertCronSecret, _resetCronRateLimiter } from './cron-auth';

// Pure Auth-Logik — kein DB/Netz. Wir setzen INGEST_CRON_SECRET direkt in
// process.env und bauen minimale Request-Objekte mit Bearer-Header + IP.

const SECRET = 'x'.repeat(48); // ≥ 32, plausibel wie `openssl rand -hex`

function req(auth?: string, ip = '10.0.0.1'): Request {
  const headers: Record<string, string> = { 'x-forwarded-for': ip };
  if (auth !== undefined) headers.authorization = auth;
  return new Request('https://example.test/api/ingest/run', {
    method: 'POST',
    headers,
  });
}

beforeEach(() => {
  _resetCronRateLimiter();
  process.env.INGEST_CRON_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.INGEST_CRON_SECRET;
});

describe('assertCronSecret', () => {
  it('passes (returns null) for the correct Bearer secret', () => {
    expect(assertCronSecret(req(`Bearer ${SECRET}`))).toBeNull();
  });

  it('returns 503 when INGEST_CRON_SECRET is unset', async () => {
    delete process.env.INGEST_CRON_SECRET;
    const res = assertCronSecret(req(`Bearer ${SECRET}`));
    expect(res?.status).toBe(503);
  });

  it('returns 401 for a wrong Bearer token', () => {
    const res = assertCronSecret(req('Bearer definitely-not-the-secret'));
    expect(res?.status).toBe(401);
  });

  it('returns 401 when the Authorization header is missing', () => {
    expect(assertCronSecret(req(undefined))?.status).toBe(401);
  });

  it('returns 401 for a length-mismatched token (no timingSafeEqual throw)', () => {
    // Kürzer als das Secret — SHA-256 gleicht die Länge an, also 401 statt Crash.
    expect(assertCronSecret(req('Bearer short'))?.status).toBe(401);
  });

  it('returns 401 for a non-Bearer scheme', () => {
    expect(assertCronSecret(req(`Basic ${SECRET}`))?.status).toBe(401);
  });

  it('rate-limits after 5 failures from the same IP → 429', () => {
    const ip = '203.0.113.7';
    for (let i = 0; i < 5; i++) {
      expect(assertCronSecret(req('Bearer wrong', ip))?.status).toBe(401);
    }
    // 6. Versuch (auch mit korrektem Secret) ist geblockt.
    expect(assertCronSecret(req(`Bearer ${SECRET}`, ip))?.status).toBe(429);
  });

  it('does not rate-limit a different IP', () => {
    const bad = '203.0.113.8';
    for (let i = 0; i < 5; i++) assertCronSecret(req('Bearer wrong', bad));
    // Andere IP bleibt frei.
    expect(assertCronSecret(req(`Bearer ${SECRET}`, '203.0.113.9'))).toBeNull();
  });

  it('resets the failure counter after a success', () => {
    const ip = '203.0.113.10';
    for (let i = 0; i < 4; i++) assertCronSecret(req('Bearer wrong', ip));
    // Erfolg setzt zurück …
    expect(assertCronSecret(req(`Bearer ${SECRET}`, ip))).toBeNull();
    // … also sind wieder volle 5 Fehlversuche möglich, ohne 429.
    for (let i = 0; i < 5; i++) {
      expect(assertCronSecret(req('Bearer wrong', ip))?.status).toBe(401);
    }
  });
});
