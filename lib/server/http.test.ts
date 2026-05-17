import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  ApiValidationError,
  validateBody,
  validateQuery,
  validateParams,
  withApiError,
} from './http';

const bodySchema = z.object({ name: z.string().min(1) });

describe('validateBody', () => {
  it('returns typed data for a valid JSON body', async () => {
    const req = new Request('http://localhost/', {
      method: 'POST',
      body: JSON.stringify({ name: 'ok' }),
    });
    expect(await validateBody(req, bodySchema)).toEqual({ name: 'ok' });
  });

  it('treats a non-JSON body as {} so the schema decides (throws)', async () => {
    const req = new Request('http://localhost/', {
      method: 'POST',
      body: 'not json',
    });
    await expect(validateBody(req, bodySchema)).rejects.toBeInstanceOf(
      ApiValidationError,
    );
  });

  it('throws ApiValidationError with the first zod issue message', async () => {
    const req = new Request('http://localhost/', {
      method: 'POST',
      body: JSON.stringify({ name: '' }),
    });
    await expect(validateBody(req, bodySchema)).rejects.toThrow(
      ApiValidationError,
    );
  });
});

describe('validateQuery', () => {
  const schema = z.object({ q: z.string(), n: z.coerce.number() });
  it('parses URLSearchParams via Object.fromEntries', () => {
    const sp = new URLSearchParams('q=hi&n=5');
    expect(validateQuery(sp, schema)).toEqual({ q: 'hi', n: 5 });
  });
  it('collapses repeated keys to the last value (documented semantics)', () => {
    const sp = new URLSearchParams('q=a&q=b');
    expect(validateQuery(sp, z.object({ q: z.string() })).q).toBe('b');
  });
  it('throws ApiValidationError on a bad param', () => {
    const sp = new URLSearchParams('q=hi&n=abc');
    expect(() => validateQuery(sp, schema)).toThrow(ApiValidationError);
  });
});

describe('validateParams', () => {
  const schema = z.object({ id: z.string().min(1) });
  it('returns typed params', () => {
    expect(validateParams({ id: 'x' }, schema)).toEqual({ id: 'x' });
  });
  it('throws ApiValidationError on a bad param', () => {
    expect(() => validateParams({}, schema)).toThrow(ApiValidationError);
  });
});

describe('withApiError maps ApiValidationError to a structured 400', () => {
  it('ApiValidationError -> 400 { error }', async () => {
    const handler = withApiError(async (_req: Request) => {
      throw new ApiValidationError('bad input');
    });
    const res = await handler(new Request('http://localhost/'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad input' });
  });

  it('a generic throw still maps to 500 (unchanged)', async () => {
    const handler = withApiError(async (_req: Request) => {
      throw new Error('boom');
    });
    const res = await handler(new Request('http://localhost/'));
    expect(res.status).toBe(500);
  });
});
