import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { DraftNotConfiguredError, DraftRefusedError } from '@/lib/server/typo3-bridge/draft';

// POST /api/typo3-bridge/news/assist: Auth, Eingangsprüfungen (400/413), beide
// Aufgaben und die Abbildung von Claude-Fehlern. Der Claude-Aufruf selbst ist
// gemockt; Request-Form und Kürzen prüft lib/server/typo3-bridge/news-assist.test.ts.

const generateNewsAssist = vi.fn();
const createNewsAssistClient = vi.fn();
vi.mock('@/lib/server/typo3-bridge/news-assist', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/typo3-bridge/news-assist')>()),
  generateNewsAssist: (...a: unknown[]) => generateNewsAssist(...a),
  createNewsAssistClient: (...a: unknown[]) => createNewsAssistClient(...a),
}));
vi.mock('@/lib/server/llm-client', () => ({ estimateCost: async () => 0.01 }));

const { POST, OPTIONS } = await import('./route');
const { _resetBridgeRateLimiter } = await import('@/lib/server/typo3-bridge/http');

const TOKEN = 'n'.repeat(64);
const URL_ = 'http://localhost:3000/api/typo3-bridge/news/assist';
const ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
const TEXT = '<p>' + 'Forschende der ÖAW vermessen mit einem Satelliten die Magnetosphäre der Erde. '.repeat(4) + '</p>';

const TEXTS_RESULT = {
  suggestions: { title: 'T', category_title: 'Weltraum', category_subtitle: null, teaser: 'X', seo_description: 'S', alternative_title: 'A', keywords: 'a, b, c' },
  notes: ['Dachzeile unten: kein Vorschlag.'],
  model: 'claude-opus-5-5',
  generated_at: '2026-11-27T08:00:00Z',
};
const IMAGE_RESULT = { ...TEXTS_RESULT, suggestions: { alt_text: 'Ein Satellit.', caption: 'Der Satellit.' }, notes: [] };

function post(body: unknown, { token = TOKEN, headers = {} }: { token?: string | null; headers?: Record<string, string> } = {}) {
  return POST(
    new Request(URL_, {
      method: 'POST',
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        origin: ORIGIN,
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
}

const b64OfBytes = (bytes: number) => 'A'.repeat(Math.ceil(bytes / 3) * 4);
const apiError = (status: number) => Anthropic.APIError.generate(status, { type: 'error' }, `status ${status}`, new Headers());

beforeEach(() => {
  vi.clearAllMocks();
  _resetBridgeRateLimiter();
  vi.stubEnv('TYPO3_BRIDGE_TOKEN', TOKEN);
  createNewsAssistClient.mockReturnValue({});
  generateNewsAssist.mockImplementation(async (req: { task: string }) => ({
    response: req.task === 'texts' ? TEXTS_RESULT : IMAGE_RESULT,
    effort: req.task === 'texts' ? 'high' : 'medium',
    usage: { promptTokens: 100, completionTokens: 50 },
  }));
});
afterEach(() => vi.unstubAllEnvs());

describe('POST /api/typo3-bridge/news/assist: Auth', () => {
  it('ohne oder mit falschem Token 401, mit CORS-Headern', async () => {
    const none = await post({ task: 'texts', bodytext_html: TEXT }, { token: null });
    expect(none.status).toBe(401);
    expect(none.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect((await post({ task: 'texts', bodytext_html: TEXT }, { token: 'falsch' })).status).toBe(401);
    expect(generateNewsAssist).not.toHaveBeenCalled();
  });

  it('ohne TYPO3_BRIDGE_TOKEN 503', async () => {
    vi.stubEnv('TYPO3_BRIDGE_TOKEN', '');
    expect((await post({ task: 'texts', bodytext_html: TEXT })).status).toBe(503);
  });

  it('OPTIONS antwortet 204 ohne Token', () => {
    const res = OPTIONS(new Request(URL_, { method: 'OPTIONS', headers: { origin: ORIGIN } }));
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });
});

describe('POST /api/typo3-bridge/news/assist: Eingang', () => {
  it('400 bei zu wenig Text, mit Zählung', async () => {
    const res = await post({ task: 'texts', title: 'Kurz', bodytext_html: '<p>Zu kurz.</p>' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/^Zu wenig Text für Vorschläge: .* mindestens 200 Zeichen \(bisher 13\)\.$/);
    expect(generateNewsAssist).not.toHaveBeenCalled();
  });

  it('400 bei unbekannter Aufgabe und zu langem Zusatzwunsch', async () => {
    expect((await (await post({ task: 'summary', bodytext_html: TEXT })).json()).error).toMatch(/Unbekannte Aufgabe/);
    const long = await post({ task: 'texts', bodytext_html: TEXT, instructions: 'x'.repeat(2001) });
    expect(long.status).toBe(400);
    expect((await long.json()).error).toBe('Der Zusatzwunsch darf höchstens 2000 Zeichen haben.');
  });

  it('400 für image ohne Bild, mit falschem Format oder ungültigem base64', async () => {
    expect((await (await post({ task: 'image', bodytext_html: TEXT })).json()).error).toBe('Für Alt-Text und Bildunterschrift fehlt das Bild.');
    const gif = await post({ task: 'image', image: { media_type: 'image/gif', data: 'AAAA' } });
    expect(gif.status).toBe(400);
    expect((await gif.json()).error).toMatch(/Bildformat/);
    const bad = await post({ task: 'image', image: { media_type: 'image/webp', data: 'kein base64!' } });
    expect(bad.status).toBe(400);
    expect(generateNewsAssist).not.toHaveBeenCalled();
  });

  it('413 für ein Bild über 1,5 MB und für einen zu großen Body', async () => {
    const big = await post({ task: 'image', image: { media_type: 'image/webp', data: b64OfBytes(1.6 * 1024 * 1024) } });
    expect(big.status).toBe(413);
    expect((await big.json()).error).toBe('Das Bild ist zu groß (1,6 MB, höchstens 1,5 MB).');
    const huge = await post({ task: 'texts', bodytext_html: TEXT }, { headers: { 'content-length': String(5 * 1024 * 1024) } });
    expect(huge.status).toBe(413);
    expect(generateNewsAssist).not.toHaveBeenCalled();
  });

  it('ein Bild knapp unter 1,5 MB geht durch, Texte zählen bei image nicht', async () => {
    const res = await post({ task: 'image', image: { media_type: 'image/webp', data: b64OfBytes(1.4 * 1024 * 1024) } });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/typo3-bridge/news/assist: Aufgaben', () => {
  it('texts: reicht den geprüften Body durch (kind news als Vorgabe) und liefert die Vorschläge', async () => {
    const res = await post({ task: 'texts', title: 'Sonnenstürme', bodytext_html: TEXT, lang: null, image: { media_type: 'image/webp', data: 'AAAA' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual(TEXTS_RESULT);
    const [body] = generateNewsAssist.mock.calls[0]!;
    expect(body).toMatchObject({ task: 'texts', kind: 'news', title: 'Sonnenstürme' });
    expect(createNewsAssistClient).toHaveBeenCalledWith('texts');
  });

  it('image: liefert Alt-Text und Bildunterschrift', async () => {
    const res = await post({ task: 'image', kind: 'top', title: 'Sonnenstürme', image: { media_type: 'image/webp', data: 'UklGRg==' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(IMAGE_RESULT);
    expect(createNewsAssistClient).toHaveBeenCalledWith('image');
  });
});

describe('POST /api/typo3-bridge/news/assist: Claude-Fehler', () => {
  it.each([
    ['fehlender Key', () => new DraftNotConfiguredError(), 503],
    ['Ablehnung', () => new DraftRefusedError('cyber'), 422],
    ['Rate-Limit', () => apiError(429), 429],
    ['Zeitüberschreitung', () => new Anthropic.APIConnectionTimeoutError(), 504],
    ['Authentifizierung', () => apiError(401), 502],
  ])('%s → %i', async (_name, make, status) => {
    generateNewsAssist.mockRejectedValueOnce(make());
    const res = await post({ task: 'texts', bodytext_html: TEXT });
    expect(res.status).toBe(status);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  it('fehlender Key schon beim Client: 503', async () => {
    createNewsAssistClient.mockImplementationOnce(() => {
      throw new DraftNotConfiguredError();
    });
    expect((await post({ task: 'texts', bodytext_html: TEXT })).status).toBe(503);
  });
});
