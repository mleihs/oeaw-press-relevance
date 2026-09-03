import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRateLimiter, getClientIp } from './rate-limit';

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T12:00:00Z'));
  });

  it('blocks after maxAttempts failures within the window', () => {
    const limiter = createRateLimiter({ maxAttempts: 3, windowMs: 60_000 });
    expect(limiter.isBlocked('1.2.3.4')).toBe(false);
    limiter.recordFailure('1.2.3.4');
    limiter.recordFailure('1.2.3.4');
    expect(limiter.isBlocked('1.2.3.4')).toBe(false);
    limiter.recordFailure('1.2.3.4');
    expect(limiter.isBlocked('1.2.3.4')).toBe(true);
  });

  it('keeps separate counters per IP', () => {
    const limiter = createRateLimiter({ maxAttempts: 2, windowMs: 60_000 });
    limiter.recordFailure('1.2.3.4');
    limiter.recordFailure('1.2.3.4');
    expect(limiter.isBlocked('1.2.3.4')).toBe(true);
    expect(limiter.isBlocked('9.9.9.9')).toBe(false);
  });

  it('resets the window after the configured duration', () => {
    const limiter = createRateLimiter({ maxAttempts: 2, windowMs: 60_000 });
    limiter.recordFailure('1.2.3.4');
    limiter.recordFailure('1.2.3.4');
    expect(limiter.isBlocked('1.2.3.4')).toBe(true);
    vi.advanceTimersByTime(60_001);
    expect(limiter.isBlocked('1.2.3.4')).toBe(false);
  });

  it('reset(ip) clears a single IP without affecting others', () => {
    const limiter = createRateLimiter({ maxAttempts: 1, windowMs: 60_000 });
    limiter.recordFailure('1.2.3.4');
    limiter.recordFailure('9.9.9.9');
    limiter.reset('1.2.3.4');
    expect(limiter.isBlocked('1.2.3.4')).toBe(false);
    expect(limiter.isBlocked('9.9.9.9')).toBe(true);
  });

  it('clear() wipes the entire map', () => {
    const limiter = createRateLimiter({ maxAttempts: 1, windowMs: 60_000 });
    limiter.recordFailure('1.2.3.4');
    limiter.recordFailure('9.9.9.9');
    limiter.clear();
    expect(limiter.isBlocked('1.2.3.4')).toBe(false);
    expect(limiter.isBlocked('9.9.9.9')).toBe(false);
  });

  it('caps client-controlled keys at 128 chars (same bucket beyond the cap)', () => {
    const limiter = createRateLimiter({ maxAttempts: 2, windowMs: 60_000 });
    const base = 'x'.repeat(128);
    // Zwei „verschiedene" überlange Keys mit gleichem 128er-Präfix teilen
    // sich den Bucket — der Angreifer kann per Key-Länge keinen Speicher
    // allozieren und per Suffix-Variation den Limiter nicht umgehen.
    limiter.recordFailure(base + 'AAAA');
    limiter.recordFailure(base + 'BBBB');
    expect(limiter.isBlocked(base + 'CCCC')).toBe(true);
    expect(limiter.isBlocked(base)).toBe(true);
  });

  it('evicts the oldest entry once maxEntries is reached', () => {
    const limiter = createRateLimiter({ maxAttempts: 1, windowMs: 60_000, maxEntries: 3 });
    limiter.recordFailure('ip-1');
    limiter.recordFailure('ip-2');
    limiter.recordFailure('ip-3');
    expect(limiter.isBlocked('ip-1')).toBe(true);
    // Vierter Key am Deckel: ältester (ip-1) fliegt, Rest bleibt blockiert.
    limiter.recordFailure('ip-4');
    expect(limiter.isBlocked('ip-1')).toBe(false);
    expect(limiter.isBlocked('ip-2')).toBe(true);
    expect(limiter.isBlocked('ip-3')).toBe(true);
    expect(limiter.isBlocked('ip-4')).toBe(true);
  });

  it('sweeps expired entries at the cap before evicting live ones', () => {
    const limiter = createRateLimiter({ maxAttempts: 1, windowMs: 60_000, maxEntries: 2 });
    limiter.recordFailure('expired-ip');
    vi.advanceTimersByTime(60_001);
    limiter.recordFailure('live-ip');
    // Am Deckel: der abgelaufene Eintrag wird weggeräumt, der lebendige
    // (live-ip) bleibt blockiert statt als „ältester" geopfert zu werden.
    limiter.recordFailure('new-ip');
    expect(limiter.isBlocked('live-ip')).toBe(true);
    expect(limiter.isBlocked('new-ip')).toBe(true);
  });

  it('isBlocked deletes an expired entry instead of just ignoring it', () => {
    const limiter = createRateLimiter({ maxAttempts: 1, windowMs: 60_000, maxEntries: 2 });
    limiter.recordFailure('a');
    vi.advanceTimersByTime(60_001);
    // Der Read räumt den abgelaufenen Eintrag auf …
    expect(limiter.isBlocked('a')).toBe(false);
    // … sodass am Deckel kein lebendiger Eintrag für ihn weichen muss.
    limiter.recordFailure('b');
    limiter.recordFailure('c');
    expect(limiter.isBlocked('b')).toBe(true);
    expect(limiter.isBlocked('c')).toBe(true);
  });
});

describe('getClientIp', () => {
  function mkReq(headers: Record<string, string>): Request {
    return new Request('http://example.com', { headers });
  }

  it('prefers x-forwarded-for first hop', () => {
    expect(getClientIp(mkReq({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip', () => {
    expect(getClientIp(mkReq({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
  });

  it('returns "unknown" when no IP headers are present', () => {
    expect(getClientIp(mkReq({}))).toBe('unknown');
  });

  it('trims whitespace around the first hop', () => {
    expect(getClientIp(mkReq({ 'x-forwarded-for': '  1.2.3.4  , 5.6.7.8' }))).toBe('1.2.3.4');
  });
});
