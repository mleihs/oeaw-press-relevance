import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// GET /api/typo3-bridge/events: Query → Listenoptionen, Antwortform des
// Vertrags, Bearer-Grenze vor der DB. Die Lesesicht ist gemockt (keine DB);
// die WHERE-Klausel selbst prüft lib/server/typo3-bridge/events.test.ts.

const listBridgeEvents = vi.fn();
const lastSyncedAt = vi.fn();
vi.mock('@/lib/server/typo3-bridge/events', () => ({
  listBridgeEvents: (...a: unknown[]) => listBridgeEvents(...a),
  lastSyncedAt: () => lastSyncedAt(),
}));

const { GET, OPTIONS } = await import('./route');
const { _resetBridgeRateLimiter } = await import('@/lib/server/typo3-bridge/http');

const TOKEN = 'b'.repeat(64);
const get = (qs = '', auth: string | null = `Bearer ${TOKEN}`) =>
  GET(new Request(`http://localhost:3000/api/typo3-bridge/events${qs}`, { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  vi.clearAllMocks();
  _resetBridgeRateLimiter();
  vi.stubEnv('TYPO3_BRIDGE_TOKEN', TOKEN);
  listBridgeEvents.mockResolvedValue([{ id: 'e1' }]);
  lastSyncedAt.mockResolvedValue('2026-11-26T03:00:00Z');
});
afterEach(() => vi.unstubAllEnvs());

describe('GET /api/typo3-bridge/events', () => {
  it('liefert { events, synced_at }', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ events: [{ id: 'e1' }], synced_at: '2026-11-26T03:00:00Z' });
    expect(listBridgeEvents).toHaveBeenCalledWith({ q: undefined, includeAll: false });
  });

  it('reicht q und include=all durch', async () => {
    await get('?q=Imperien&include=all');
    expect(listBridgeEvents).toHaveBeenCalledWith({ q: 'Imperien', includeAll: true });
  });

  it('wertet nur include=all als „alle"', async () => {
    await get('?include=yes');
    expect(listBridgeEvents).toHaveBeenCalledWith({ q: undefined, includeAll: false });
  });

  it('fragt ohne gültiges Token die DB nie ab', async () => {
    expect((await get('', null)).status).toBe(401);
    expect((await get('', 'Bearer falsch')).status).toBe(401);
    vi.stubEnv('TYPO3_BRIDGE_TOKEN', '');
    expect((await get()).status).toBe(503);
    expect(listBridgeEvents).not.toHaveBeenCalled();
  });

  it('beantwortet OPTIONS mit 204 und CORS', async () => {
    const res = OPTIONS(new Request('http://localhost:3000/api/typo3-bridge/events', { method: 'OPTIONS' }));
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-headers')).toBe('Authorization, Content-Type');
  });
});
