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
