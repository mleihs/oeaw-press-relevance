import { describe, it, expect } from 'vitest';
import { generatePassword } from './password';

describe('generatePassword', () => {
  it('produces the xxxx-xxxx-xxxx shape by default', () => {
    expect(generatePassword()).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{4}-[a-km-zA-HJ-NP-Z2-9]{4}-[a-km-zA-HJ-NP-Z2-9]{4}$/);
  });

  it('never contains confusable characters (0/O, 1/l/I)', () => {
    for (let i = 0; i < 50; i++) {
      expect(generatePassword()).not.toMatch(/[01OlI]/);
    }
  });

  it('respects custom group parameters', () => {
    expect(generatePassword(2, 6)).toMatch(/^[^-]{6}-[^-]{6}$/);
  });

  it('is non-deterministic', () => {
    const seen = new Set(Array.from({ length: 20 }, () => generatePassword()));
    expect(seen.size).toBe(20);
  });

  it('satisfies the userCreatePayloadSchema minimum length', () => {
    expect(generatePassword().length).toBeGreaterThanOrEqual(10);
  });
});
