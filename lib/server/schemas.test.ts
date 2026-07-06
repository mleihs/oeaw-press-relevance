import { describe, it, expect } from 'vitest';
import { idParamSchema } from './schemas';

describe('idParamSchema (Postgres-uuid-Semantik: 8-4-4-4-12 hex)', () => {
  it('accepts a real gen_random_uuid() v4 id', () => {
    expect(
      idParamSchema.safeParse({
        id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      }).success,
    ).toBe(true);
  });
  it('accepts non-RFC hex uuids (MT-Import stableUuid, gültige pg-uuids)', () => {
    expect(
      idParamSchema.safeParse({
        id: 'dca78c17-866a-ab87-f3a7-8b6537be2aa6',
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
