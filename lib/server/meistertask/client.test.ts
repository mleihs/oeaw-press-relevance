import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MeistertaskClient,
  MeistertaskApiError,
  MeistertaskAuthError,
  MeistertaskRateLimitError,
  getMeistertaskClient,
} from './client';

// Mock factory: minimal Response-shape — only what client.ts inspects.
type MockResponse = {
  status: number;
  ok: boolean;
  headers: Headers;
  json: () => Promise<unknown>;
};

function mockResponse(opts: {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  jsonThrows?: boolean;
}): MockResponse {
  const status = opts.status;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(opts.headers ?? {}),
    json: opts.jsonThrows
      ? async () => {
          throw new Error('parse error');
        }
      : async () => opts.body ?? {},
  };
}

const TASK_RESPONSE = {
  id: 999,
  token: 'tk-abc',
  section_id: 42,
  name: 'created',
  notes: null,
  status: 1,
  created_at: '2026-04-29T00:00:00Z',
  updated_at: '2026-04-29T00:00:00Z',
};

describe('MeistertaskClient.createTask', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns parsed task on 2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ status: 200, body: TASK_RESPONSE }));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const client = new MeistertaskClient('tok', { rps: 1000 });
    const task = await client.createTask(42, { name: 'hi' });

    expect(task.id).toBe(999);
    expect(task.token).toBe('tk-abc');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/sections/42/tasks');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'hi' });
  });

  it('throws MeistertaskAuthError on 401', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockResponse({ status: 401, body: { error: 'unauth' } })) as unknown as typeof globalThis.fetch;

    const client = new MeistertaskClient('bad', { rps: 1000 });
    await expect(client.createTask(1, { name: 'x' })).rejects.toBeInstanceOf(MeistertaskAuthError);
  });

  it('retries once on 429 then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse({ status: 429, body: { error: 'rl' }, headers: { 'Retry-After': '0' } }),
      )
      .mockResolvedValueOnce(mockResponse({ status: 200, body: TASK_RESPONSE }));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const client = new MeistertaskClient('tok', { rps: 1000 });
    const task = await client.createTask(1, { name: 'x' });

    expect(task.id).toBe(999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws MeistertaskRateLimitError on second consecutive 429', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        mockResponse({ status: 429, body: { error: 'rl' }, headers: { 'Retry-After': '0' } }),
      );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const client = new MeistertaskClient('tok', { rps: 1000 });
    await expect(client.createTask(1, { name: 'x' })).rejects.toBeInstanceOf(
      MeistertaskRateLimitError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('parses Retry-After numeric value into the error', async () => {
    // First 429 with Retry-After=0 makes the auto-retry instant; second 429
    // with Retry-After=7 is the one that surfaces in the thrown error.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse({ status: 429, body: {}, headers: { 'Retry-After': '0' } }),
      )
      .mockResolvedValueOnce(
        mockResponse({ status: 429, body: {}, headers: { 'Retry-After': '7' } }),
      );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const client = new MeistertaskClient('tok', { rps: 1000 });
    try {
      await client.createTask(1, { name: 'x' });
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(MeistertaskRateLimitError);
      expect((e as MeistertaskRateLimitError).retryAfterSeconds).toBe(7);
    }
  });

  it('throws MeistertaskApiError on generic 5xx', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockResponse({ status: 500, body: { error: 'srv' } })) as unknown as typeof globalThis.fetch;

    const client = new MeistertaskClient('tok', { rps: 1000 });
    try {
      await client.createTask(1, { name: 'x' });
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(MeistertaskApiError);
      expect((e as MeistertaskApiError).status).toBe(500);
      // Subclass check: this should NOT be Auth or RateLimit
      expect(e).not.toBeInstanceOf(MeistertaskAuthError);
      expect(e).not.toBeInstanceOf(MeistertaskRateLimitError);
    }
  });

  it('handles unparseable JSON error body gracefully', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockResponse({ status: 500, jsonThrows: true })) as unknown as typeof globalThis.fetch;

    const client = new MeistertaskClient('tok', { rps: 1000 });
    try {
      await client.createTask(1, { name: 'x' });
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(MeistertaskApiError);
      expect((e as MeistertaskApiError).body).toEqual({});
    }
  });
});

describe('MeistertaskClient rate limiter', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('serializes concurrent calls — fetch is invoked one-by-one even under burst', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Yield once so other queued promises could in theory race in.
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return mockResponse({ status: 200, body: TASK_RESPONSE });
    }) as unknown as typeof globalThis.fetch;

    // rps=1 forces serialization through the limiter (slots=1 starting).
    const client = new MeistertaskClient('tok', { rps: 1 });
    await Promise.all(
      Array.from({ length: 5 }, (_, i) => client.createTask(i, { name: `t${i}` })),
    );

    // With chain-serialization, only one fetch may be in flight at a time.
    expect(maxInFlight).toBe(1);
  });
});

describe('getMeistertaskClient (module-scope singleton)', () => {
  it('returns the same instance for repeated same-token calls', () => {
    const a = getMeistertaskClient('singleton-token-1');
    const b = getMeistertaskClient('singleton-token-1');
    expect(a).toBe(b);
  });

  it('returns a fresh instance when the token changes', () => {
    const a = getMeistertaskClient('singleton-token-A');
    const b = getMeistertaskClient('singleton-token-B');
    expect(a).not.toBe(b);
  });
});
