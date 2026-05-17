import { describe, it, expect } from 'vitest';
import { idParamSchema } from './schemas';

describe('idParamSchema (drizzle-zod, derived from publications.id)', () => {
  it('accepts a real gen_random_uuid() v4 id', () => {
    // shape every id the app ever issues (RFC-4122 v4, variant 8/9/a/b)
    expect(
      idParamSchema.safeParse({
        id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      }).success,
    ).toBe(true);
  });
  it('rejects malformed ids with a clean 400 (was a uuid-syntax 500)', () => {
    expect(idParamSchema.safeParse({ id: 'abc' }).success).toBe(false);
    expect(idParamSchema.safeParse({ id: '' }).success).toBe(false);
    expect(idParamSchema.safeParse({}).success).toBe(false);
    expect(
      idParamSchema.safeParse({ id: '3f2504e0-4f89-41d3-9a0c' }).success,
    ).toBe(false);
  });
});
