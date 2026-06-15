import { describe, it, expect } from 'vitest';
import { tokenize, timingSafePasswordMatch } from './gate';
import { isPublicGatePath, GATE_COOKIE_NAME } from '@/lib/shared/gate';

describe('tokenize', () => {
  it('produces a stable 64-char SHA-256 hex digest', () => {
    const t = tokenize('movefastandbreakthings');
    expect(t).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenize('movefastandbreakthings')).toBe(t); // deterministic
  });

  it('differs for different passwords', () => {
    expect(tokenize('a')).not.toBe(tokenize('b'));
  });
});

describe('timingSafePasswordMatch', () => {
  it('returns true for an exact match', () => {
    expect(timingSafePasswordMatch('secret', 'secret')).toBe(true);
  });

  it('returns false for a mismatch', () => {
    expect(timingSafePasswordMatch('secret', 'Secret')).toBe(false);
    expect(timingSafePasswordMatch('secret', 'wrong')).toBe(false);
  });

  it('handles differing lengths without throwing (hashes equalize length)', () => {
    expect(timingSafePasswordMatch('short', 'a-much-longer-password')).toBe(false);
    expect(timingSafePasswordMatch('', 'x')).toBe(false);
  });

  it('matches empty against empty', () => {
    expect(timingSafePasswordMatch('', '')).toBe(true);
  });
});

describe('isPublicGatePath', () => {
  it('allows the login endpoint + listed static assets', () => {
    expect(isPublicGatePath('/api/auth/gate')).toBe(true);
    expect(isPublicGatePath('/robots.txt')).toBe(true);
    expect(isPublicGatePath('/favicon.ico')).toBe(true);
  });

  it('allows public prefixes (Next internals, gate background)', () => {
    expect(isPublicGatePath('/_next/static/chunk.js')).toBe(true);
    expect(isPublicGatePath('/capybara-bg.png')).toBe(true);
  });

  it('gates everything else', () => {
    expect(isPublicGatePath('/')).toBe(false);
    expect(isPublicGatePath('/publications')).toBe(false);
    expect(isPublicGatePath('/api/social/refresh')).toBe(false);
    // a near-miss on the login path must NOT be treated as public
    expect(isPublicGatePath('/api/auth/gate/extra')).toBe(false);
    expect(isPublicGatePath('/api/auth')).toBe(false);
  });
});

describe('GATE_COOKIE_NAME', () => {
  it('is the shared cookie name used by both the route and the proxy', () => {
    expect(GATE_COOKIE_NAME).toBe('gate');
  });
});
