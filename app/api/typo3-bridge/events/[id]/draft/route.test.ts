import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { DraftNotConfiguredError, DraftRefusedError, DraftUnusableError } from '@/lib/server/typo3-bridge/draft';

// POST /api/typo3-bridge/events/:id/draft: Body → Service, 404-Fälle und die
// Abbildung von Claude-Fehlern auf HTTP-Codes. Wichtig: kein Anthropic-Fehler
// darf als 401/403 ankommen (das Panel zeigte „Token abgelehnt") und keiner
// als 503 außer dem fehlenden Key („Schnittstelle abgeschaltet"). Den
// Cache-Ablauf mit gemocktem SDK-Client prüft draft-service.test.ts.

const getOrCreateDraft = vi.fn();
vi.mock('@/lib/server/typo3-bridge/draft-service', () => ({
  getOrCreateDraft: (...a: unknown[]) => getOrCreateDraft(...a),
}));

const { POST } = await import('./route');
const { _resetBridgeRateLimiter } = await import('@/lib/server/typo3-bridge/http');

const TOKEN = 'c'.repeat(64);
const ID = '11111111-1111-4111-8111-111111111111';
const RESULT = { draft: { title: 'T' }, notes: [], model: 'claude-opus-5-5', generated_at: '2026-11-27T10:00:00Z', cached: false };

function post(id: string, body?: unknown) {
  return POST(
    new Request(`http://localhost:3000/api/typo3-bridge/events/${id}/draft`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
    { params: Promise.resolve({ id }) },
  );
}

const apiError = (status: number) => Anthropic.APIError.generate(status, { type: 'error' }, `status ${status}`, new Headers());

beforeEach(() => {
  vi.clearAllMocks();
  _resetBridgeRateLimiter();
  vi.stubEnv('TYPO3_BRIDGE_TOKEN', TOKEN);
  getOrCreateDraft.mockResolvedValue(RESULT);
});
afterEach(() => vi.unstubAllEnvs());

describe('POST /api/typo3-bridge/events/:id/draft', () => {
  it('reicht refresh und instructions durch und liefert den Entwurf', async () => {
    const res = await post(ID, { refresh: true, instructions: 'Kürzer.' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(RESULT);
    expect(getOrCreateDraft).toHaveBeenCalledWith(ID, { refresh: true, instructions: 'Kürzer.' });
  });

  it('nimmt einen leeren Body als {}', async () => {
    expect((await post(ID)).status).toBe(200);
    expect(getOrCreateDraft).toHaveBeenCalledWith(ID, {});
  });

  it('antwortet 404 für eine ungültige oder unbekannte id', async () => {
    expect((await post('40455', {})).status).toBe(404);
    expect(getOrCreateDraft).not.toHaveBeenCalled();
    getOrCreateDraft.mockResolvedValueOnce(null);
    expect((await post(ID, {})).status).toBe(404);
  });

  it('weist einen überlangen Zusatzwunsch mit 400 ab', async () => {
    expect((await post(ID, { instructions: 'x'.repeat(2001) })).status).toBe(400);
    expect(getOrCreateDraft).not.toHaveBeenCalled();
  });

  it.each([
    ['fehlender ANTHROPIC_API_KEY', new DraftNotConfiguredError(), 503],
    ['Ablehnung (refusal)', new DraftRefusedError('cyber'), 422],
    ['unbrauchbare Antwort', new DraftUnusableError('abgeschnitten'), 502],
    ['Rate-Limit', apiError(429), 429],
    ['falscher Anthropic-Key (401)', apiError(401), 502],
    ['fehlende Berechtigung (403)', apiError(403), 502],
    ['ungültige Anfrage (400)', apiError(400), 502],
    ['Überlast (529)', apiError(529), 502],
    ['Zeitüberschreitung', new Anthropic.APIConnectionTimeoutError(), 504],
    ['Netzfehler', new Anthropic.APIConnectionError({ message: 'down' }), 502],
  ])('bildet %s auf %i ab, mit CORS', async (_label, err, status) => {
    getOrCreateDraft.mockRejectedValueOnce(err);
    const res = await post(ID, {});
    expect(res.status).toBe(status);
    expect(typeof (await res.json()).error).toBe('string');
    expect(res.headers.get('access-control-allow-origin')).toMatch(/^chrome-extension:\/\//);
  });

  it('lässt unbekannte Fehler als 500 durch', async () => {
    getOrCreateDraft.mockRejectedValueOnce(new Error('DB weg'));
    expect((await post(ID, {})).status).toBe(500);
  });
});
