import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLM_MODELS, formatModelPricing } from '@/lib/shared/constants';
import { getLiveModelPricing, __resetPricingCache } from './llm-pricing';

vi.mock('@/lib/server/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const OPUS = 'anthropic/claude-opus-4.8';

function modelsResponse(models: unknown[]): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: models }),
  } as unknown as Response;
}

describe('getLiveModelPricing', () => {
  beforeEach(() => {
    __resetPricingCache();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    __resetPricingCache();
  });

  it('rechnet OpenRouters $/Token auf $/Mio. um und markiert sie als frisch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        modelsResponse([
          { id: OPUS, pricing: { prompt: '0.000005', completion: '0.000025' } },
        ]),
      ),
    );

    const pricing = await getLiveModelPricing();
    expect(pricing[OPUS]).toEqual({ promptUsd: 5, completionUsd: 25, stale: false });
  });

  it('lässt Modelle, die OpenRouter nicht (mehr) kennt, auf dem Fallback stehen', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => modelsResponse([])));

    const pricing = await getLiveModelPricing();
    for (const m of LLM_MODELS) {
      expect(pricing[m.value]).toEqual({ ...m.fallbackPricing, stale: true });
    }
  });

  it('ignoriert halbe Preisangaben statt sie halb zu übernehmen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => modelsResponse([{ id: OPUS, pricing: { prompt: '0.000005' } }])),
    );

    const pricing = await getLiveModelPricing();
    expect(pricing[OPUS].stale).toBe(true);
    expect(pricing[OPUS].completionUsd).toBe(25);
  });

  it('ist fail-open: ein Netzfehler liefert die Fallback-Preise, keinen Throw', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));

    const pricing = await getLiveModelPricing();
    expect(pricing[OPUS]).toEqual({ ...LLM_MODELS[0].fallbackPricing, stale: true });
  });

  it('fetcht innerhalb des Cache-Fensters nur einmal, auch bei parallelen Aufrufen', async () => {
    const fetchMock = vi.fn(async () =>
      modelsResponse([{ id: OPUS, pricing: { prompt: '0.000005', completion: '0.000025' } }]),
    );
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([getLiveModelPricing(), getLiveModelPricing()]);
    await getLiveModelPricing();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('formatModelPricing', () => {
  it('nennt beide Richtungen je Million', () => {
    expect(formatModelPricing({ promptUsd: 5, completionUsd: 25 })).toBe('$5 / $25 je M');
  });

  it('kürzt Nachkommastellen, ohne echte Cent-Beträge zu verlieren', () => {
    expect(formatModelPricing({ promptUsd: 0.2002, completionUsd: 0.8001 })).toBe(
      '$0.2 / $0.8 je M',
    );
  });

  it('nennt Gratis-Modelle beim Namen', () => {
    expect(formatModelPricing({ promptUsd: 0, completionUsd: 0 })).toBe('gratis');
  });
});
