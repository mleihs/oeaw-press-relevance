import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { log } from '@/lib/server/log';
import {
  _resetBridgeRateLimiter,
  bridgeOptions,
  bridgeRoute,
  bridgeTokenLabel,
  corsHeaders,
  isBridgeEventId,
} from './http';

// Der HTTP-Rahmen der TYPO3-Bridge: Bearer-Grenze (503/401/429), CORS auf
// JEDER Antwort, Preflight ohne Token, und kein CSRF-Abweis für den
// chrome-extension://-Origin der Extension.

const TOKEN = 't'.repeat(64);
const EXT_ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

const handler = vi.fn(async () => NextResponse.json({ ok: true }));
const route = bridgeRoute(handler);

function req(opts: { auth?: string; method?: string; origin?: string; ip?: string } = {}): Request {
  const headers: Record<string, string> = {};
  if (opts.auth !== undefined) headers.authorization = opts.auth;
  if (opts.origin) headers.origin = opts.origin;
  if (opts.ip) headers['x-forwarded-for'] = opts.ip;
  return new Request('http://localhost:3000/api/typo3-bridge/events', { method: opts.method ?? 'GET', headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetBridgeRateLimiter();
  vi.stubEnv('TYPO3_BRIDGE_TOKEN', TOKEN);
  vi.stubEnv('TYPO3_BRIDGE_TOKENS', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('bridgeRoute: Bearer-Grenze', () => {
  it('lässt das richtige Token durch und ruft den Handler', async () => {
    const res = await route(req({ auth: `Bearer ${TOKEN}` }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('antwortet 503, wenn TYPO3_BRIDGE_TOKEN fehlt, und ruft den Handler nicht', async () => {
    vi.stubEnv('TYPO3_BRIDGE_TOKEN', '');
    const res = await route(req({ auth: `Bearer ${TOKEN}` }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/TYPO3_BRIDGE_TOKEN/);
    expect(handler).not.toHaveBeenCalled();
  });

  it('antwortet 401 auf ein falsches Token', async () => {
    const res = await route(req({ auth: 'Bearer falsch' }));
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('antwortet 401 ohne Authorization-Header und bei anderem Schema', async () => {
    expect((await route(req())).status).toBe(401);
    expect((await route(req({ auth: `Basic ${TOKEN}` }))).status).toBe(401);
  });

  it('bremst nach 5 Fehlversuchen derselben IP (429), das richtige Token kommt trotzdem durch', async () => {
    const ip = '198.51.100.7';
    for (let i = 0; i < 5; i++) expect((await route(req({ auth: 'Bearer x', ip }))).status).toBe(401);
    const limited = await route(req({ auth: 'Bearer x', ip }));
    expect(limited.status).toBe(429);
    // Das Panel zeigt den Text der Redakteurin: deutsch, nicht der Cron-Text.
    expect((await limited.json()).error).toMatch(/Zu viele Versuche/);
    expect((await route(req({ auth: `Bearer ${TOKEN}`, ip }))).status).toBe(200);
  });

  it('weist einen POST mit chrome-extension-Origin nicht als Cross-Origin ab (csrf aus)', async () => {
    const res = await route(req({ auth: `Bearer ${TOKEN}`, method: 'POST', origin: EXT_ORIGIN }));
    expect(res.status).toBe(200);
  });

  it('macht aus einem geworfenen Fehler 500 { error } mit CORS-Headern', async () => {
    handler.mockRejectedValueOnce(new Error('kaputt'));
    const res = await route(req({ auth: `Bearer ${TOKEN}`, origin: EXT_ORIGIN }));
    expect(res.status).toBe(500);
    expect(res.headers.get('access-control-allow-origin')).toBe(EXT_ORIGIN);
  });
});

describe('bridgeRoute: benannte Tokens (TYPO3_BRIDGE_TOKENS)', () => {
  const EXT1 = '1'.repeat(64);
  const EXT2 = '2'.repeat(64);
  // Handler, der den Namen des Tokens zurückgibt, wie ihn die Kosten-Logs lesen.
  const labelRoute = bridgeRoute(async () => NextResponse.json({ token: bridgeTokenLabel() }));

  beforeEach(() => {
    vi.stubEnv('TYPO3_BRIDGE_TOKENS', `extern-1:${EXT1},extern-2:${EXT2}`);
  });

  it('nimmt jedes benannte Token und das gemeinsame, mit dem richtigen Namen', async () => {
    const info = vi.spyOn(log, 'info');
    for (const [token, label] of [
      [EXT1, 'extern-1'],
      [EXT2, 'extern-2'],
      [TOKEN, 'gemeinsam'],
    ]) {
      const res = await labelRoute(req({ auth: `Bearer ${token}` }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ token: label });
      expect(info).toHaveBeenLastCalledWith('typo3_bridge_request', {
        token: label,
        method: 'GET',
        path: '/api/typo3-bridge/events',
      });
    }
    // Nie das Token selbst im Log.
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/1{64}|2{64}|t{64}/);
  });

  it('gesperrt = aus der Liste genommen: 401, die anderen gehen weiter', async () => {
    vi.stubEnv('TYPO3_BRIDGE_TOKENS', `extern-2:${EXT2}`);
    expect((await labelRoute(req({ auth: `Bearer ${EXT1}` }))).status).toBe(401);
    expect((await labelRoute(req({ auth: `Bearer ${EXT2}` }))).status).toBe(200);
    expect((await labelRoute(req({ auth: `Bearer ${TOKEN}` }))).status).toBe(200);
  });

  it('geht auch ohne gemeinsames Token, nur mit benannten', async () => {
    vi.stubEnv('TYPO3_BRIDGE_TOKEN', '');
    expect((await labelRoute(req({ auth: `Bearer ${EXT1}` }))).status).toBe(200);
    expect((await labelRoute(req({ auth: `Bearer ${TOKEN}` }))).status).toBe(401);
  });

  it('kaputte TYPO3_BRIDGE_TOKENS: 500, kein Durchlass', async () => {
    vi.stubEnv('TYPO3_BRIDGE_TOKENS', 'ohne-doppelpunkt');
    const res = await labelRoute(req({ auth: `Bearer ${TOKEN}` }));
    expect(res.status).toBe(500);
  });

  it('bridgeTokenLabel außerhalb einer Bridge-Route: null', () => {
    expect(bridgeTokenLabel()).toBeNull();
  });
});

describe('CORS', () => {
  it('trägt die CORS-Header auch auf 401 und 503', async () => {
    const r401 = await route(req({ origin: EXT_ORIGIN }));
    expect(r401.status).toBe(401);
    expect(r401.headers.get('access-control-allow-origin')).toBe(EXT_ORIGIN);
    expect(r401.headers.get('access-control-allow-headers')).toBe('Authorization, Content-Type');

    vi.stubEnv('TYPO3_BRIDGE_TOKEN', '');
    const r503 = await route(req());
    expect(r503.status).toBe(503);
    expect(r503.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('spiegelt chrome-extension-Origins und gibt sonst * aus', () => {
    expect(corsHeaders(req({ origin: EXT_ORIGIN }))['Access-Control-Allow-Origin']).toBe(EXT_ORIGIN);
    expect(corsHeaders(req({ origin: 'https://example.org' }))['Access-Control-Allow-Origin']).toBe('*');
    expect(corsHeaders(req())['Access-Control-Allow-Origin']).toBe('*');
    expect(corsHeaders(req()).Vary).toBe('Origin');
  });

  it('beantwortet OPTIONS ohne Token mit 204 und den CORS-Headern', async () => {
    const res = bridgeOptions(req({ method: 'OPTIONS', origin: EXT_ORIGIN }));
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(res.headers.get('access-control-allow-origin')).toBe(EXT_ORIGIN);
    expect(res.headers.get('access-control-allow-methods')).toBe('GET, POST, OPTIONS');
    expect(res.headers.get('access-control-allow-headers')).toBe('Authorization, Content-Type');
  });

  it('setzt Cache-Control: no-store', async () => {
    const res = await route(req({ auth: `Bearer ${TOKEN}` }));
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('isBridgeEventId', () => {
  it('nimmt UUIDs, sonst nichts', () => {
    expect(isBridgeEventId('11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isBridgeEventId('40455')).toBe(false);
    expect(isBridgeEventId("1' OR 1=1")).toBe(false);
  });
});
