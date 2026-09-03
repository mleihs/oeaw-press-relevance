import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';
import { GATE_COOKIE_NAME } from '@/lib/shared/gate';

// Der Edge-Gate-Proxy als reine Funktion: NextRequest konstruieren, Env per
// vi.stubEnv stubben, Response-Semantik prüfen. NextResponse.next() markiert
// sich über den `x-middleware-next`-Header — daran erkennen die Tests den
// Pass-through.

const TOKEN = 'a'.repeat(64);

function mkReq(path: string, cookie?: string): NextRequest {
  return new NextRequest(`https://example.com${path}`, {
    headers: cookie ? { cookie: `${GATE_COOKIE_NAME}=${cookie}` } : {},
  });
}

function isPassThrough(res: Response): boolean {
  return res.headers.get('x-middleware-next') === '1';
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('proxy (Edge-Gate)', () => {
  it('lässt öffentliche Pfade ohne Cookie durch', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GATE_TOKEN', TOKEN);
    const res = await proxy(mkReq('/api/auth/gate'));
    expect(isPassThrough(res)).toBe(true);
  });

  it('lässt in development alles durch (Dev-Bypass)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('GATE_TOKEN', TOKEN);
    const res = await proxy(mkReq('/publications'));
    expect(isPassThrough(res)).toBe(true);
  });

  it('antwortet 503 fail-closed, wenn GATE_TOKEN in production fehlt', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GATE_TOKEN', '');
    const res = await proxy(mkReq('/publications', TOKEN));
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('Gate misconfigured');
  });

  it('lässt ein gültiges Gate-Cookie durch', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GATE_TOKEN', TOKEN);
    const res = await proxy(mkReq('/publications', TOKEN));
    expect(isPassThrough(res)).toBe(true);
  });

  it('weist ein falsches Gate-Cookie ab', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GATE_TOKEN', TOKEN);
    const res = await proxy(mkReq('/api/publications', 'b'.repeat(64)));
    expect(res.status).toBe(401);
  });

  it('antwortet auf /api/* ohne Cookie mit 401 JSON', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GATE_TOKEN', TOKEN);
    const res = await proxy(mkReq('/api/publications'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Authentication required' });
  });

  it('leitet Seiten-Requests ohne Cookie auf / mit ?next= um', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GATE_TOKEN', TOKEN);
    const res = await proxy(mkReq('/publications'));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.pathname).toBe('/');
    expect(location.searchParams.get('next')).toBe('/publications');
  });

  it('lässt / ohne Cookie durch (dort rendert die Gate-UI, kein Redirect-Loop)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GATE_TOKEN', TOKEN);
    const res = await proxy(mkReq('/'));
    expect(isPassThrough(res)).toBe(true);
  });
});
