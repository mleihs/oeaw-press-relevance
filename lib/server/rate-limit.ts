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
  /** Harte Obergrenze der Map (Default 10.000). Der Key ist client-
   *  kontrolliert (X-Forwarded-For) — ohne Deckel wächst der Heap im
   *  langlebigen Coolify-Prozess unbegrenzt. Override primär für Tests. */
  maxEntries?: number;
}

/** Client-kontrollierte Keys längenkappen, damit ein absurd langer
 *  X-Forwarded-For-Eintrag nicht als Speicher-Vektor taugt. */
const MAX_KEY_LENGTH = 128;

const DEFAULT_MAX_ENTRIES = 10_000;

export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const attempts = new Map<string, { count: number; resetAt: number }>();
  const maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;

  const keyFor = (ip: string): string =>
    ip.length > MAX_KEY_LENGTH ? ip.slice(0, MAX_KEY_LENGTH) : ip;

  /** Abgelaufene Einträge löschen (früher wurden sie nur ignoriert, nie
   *  entfernt — unbounded Heap-Wachstum im langlebigen Prozess). */
  const sweepExpired = (now: number): void => {
    for (const [key, entry] of attempts) {
      if (entry.resetAt < now) attempts.delete(key);
    }
  };

  return {
    isBlocked(ip: string): boolean {
      const now = Date.now();
      const key = keyFor(ip);
      const entry = attempts.get(key);
      if (!entry) return false;
      if (entry.resetAt < now) {
        // Opportunistisch aufräumen statt nur ignorieren.
        attempts.delete(key);
        return false;
      }
      return entry.count >= opts.maxAttempts;
    },

    recordFailure(ip: string): void {
      const now = Date.now();
      const key = keyFor(ip);
      const entry = attempts.get(key);
      if (entry && entry.resetAt >= now) {
        entry.count++;
        return;
      }
      // Neuer Eintrag: erst am Deckel abgelaufene wegräumen; reicht das
      // nicht, fliegen die ältesten zuerst (Map hält Einfüge-Reihenfolge).
      if (!entry && attempts.size >= maxEntries) {
        sweepExpired(now);
        while (attempts.size >= maxEntries) {
          const oldest = attempts.keys().next().value;
          if (oldest === undefined) break;
          attempts.delete(oldest);
        }
      }
      attempts.set(key, { count: 1, resetAt: now + opts.windowMs });
    },

    reset(ip: string): void {
      attempts.delete(keyFor(ip));
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
