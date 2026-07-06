/**
 * In-memory IP-based rate limiter. Per Lambda instance: a determined
 * attacker can still scale around this by triggering different instances,
 * but it raises the cost enough to matter for our internal-tool threat
 * model. A shared limit would need Redis/Upstash and live as a backlog
 * item until traffic justifies the dependency.
 *
 * Usage:
 *   const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 60_000 });
 *   if (limiter.isBlocked(ip)) return apiError('Too many attempts', 429);
 *   if (!passwordOk) { limiter.recordFailure(ip); return apiError(..., 401); }
 *   limiter.reset(ip);
 *
 * Test contract: `clear()` wipes the internal Map for vitest determinism.
 */
import 'server-only';
export interface RateLimiter {
  isBlocked(ip: string): boolean;
  recordFailure(ip: string): void;
  reset(ip: string): void;
  clear(): void;
}

export interface RateLimiterOptions {
  maxAttempts: number;
  windowMs: number;
}

export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const attempts = new Map<string, { count: number; resetAt: number }>();

  return {
    isBlocked(ip: string): boolean {
      const now = Date.now();
      const entry = attempts.get(ip);
      if (!entry || entry.resetAt < now) return false;
      return entry.count >= opts.maxAttempts;
    },

    recordFailure(ip: string): void {
      const now = Date.now();
      const entry = attempts.get(ip);
      if (!entry || entry.resetAt < now) {
        attempts.set(ip, { count: 1, resetAt: now + opts.windowMs });
        return;
      }
      entry.count++;
    },

    reset(ip: string): void {
      attempts.delete(ip);
    },

    clear(): void {
      attempts.clear();
    },
  };
}

/**
 * Extracts the client IP from a Next.js request. x-forwarded-for is
 * "client, proxy1, proxy2…" — take the first hop. Falls back to
 * x-real-ip, then 'unknown' (which means multiple unidentified
 * clients share the same rate-limit bucket — acceptable trade-off
 * since attackers can't selectively avoid the 'unknown' label).
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}
