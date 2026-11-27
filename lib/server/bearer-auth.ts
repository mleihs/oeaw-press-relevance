import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { apiError } from '@/lib/server/http';
import { createRateLimiter, getClientIp } from '@/lib/server/rate-limit';

// Bearer-Prüfung gegen ein Secret aus der Env, für Maschinen- und Werkzeug-
// Zugänge ohne Gate-Cookie: den Nacht-Cron (INGEST_CRON_SECRET, lib/server/
// ingest/cron-auth.ts) und die TYPO3-Bridge der Chrome-Extension
// (TYPO3_BRIDGE_TOKEN, lib/server/typo3-bridge/http.ts). Beide Routen liegen
// gate-öffentlich in lib/shared/gate.ts; das Secret IST die Grenze.
//
// Konstante-Zeit-Vergleich: beide Seiten werden auf SHA-256 gehasht (feste
// 32-Byte-Länge) und mit timingSafeEqual verglichen, damit weder Länge noch
// Inhalt des Secrets über die Antwortzeit durchsickern.

export interface BearerGuardOptions {
  /** Liest das Secret bei jedem Aufruf (nicht beim Import), damit Tests die
   *  Env umschalten können. Leer oder unset heißt: Zugang aus. */
  secret: () => string | undefined;
  /** Text der 503-Antwort, wenn das Secret fehlt. */
  notConfigured: string;
  /** Text der 429-Antwort nach zu vielen Fehlversuchen. Die Bridge zeigt ihn
   *  der Redakteurin im Panel an, der Cron braucht ihn nur fürs Log. */
  rateLimited?: string;
}

export interface BearerGuard {
  /** Fehler-`Response` bei Ablehnung, sonst `null` (weiter). */
  assert(req: Request): Response | null;
  /** Test-Hook: Limiter-State zwischen Vitest-Fällen leeren. */
  reset(): void;
}

function sha256(s: string): Buffer {
  return createHash('sha256').update(s, 'utf8').digest();
}

/** Das Token hinter `Bearer`, sonst ''. */
export function bearerTokenOf(req: Request): string {
  const header = req.headers.get('authorization') ?? '';
  return /^Bearer\s+(.+)$/i.exec(header.trim())?.[1]?.trim() ?? '';
}

/**
 * Eine Prüfung mit eigenem Fehlversuchs-Limiter (5 je IP in 15 min → 429).
 *   - Secret unset          → 503 (Zugang nicht konfiguriert, klar unterscheidbar)
 *   - korrektes Secret      → null (immer, auch bei geblockter IP)
 *   - Fehlversuch, IP-Limit → 429
 *   - fehlend/falsch        → 401
 */
export function createBearerGuard(opts: BearerGuardOptions): BearerGuard {
  const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 15 * 60_000 });

  return {
    assert(req) {
      const secret = opts.secret()?.trim();
      if (!secret) return apiError(opts.notConfigured, 503);

      const presented = bearerTokenOf(req);
      // sha256 gibt beidseitig 32 Byte → timingSafeEqual wirft nie an der Länge.
      const ok = presented.length > 0 && timingSafeEqual(sha256(presented), sha256(secret));

      // Secret ZUERST prüfen, Limiter erst danach: getClientIp liest den ersten
      // X-Forwarded-For-Eintrag, und den bestimmt der CLIENT (Proxies hängen
      // nur an). Stünde der Limiter vor der Prüfung, könnte ein Außenstehender
      // mit 5 Fehlversuchen unter gefälschtem XFF den echten Aufrufer
      // aussperren (429 trotz korrektem Secret). Wer das Secret hat, kommt
      // deshalb IMMER durch; der Limiter bremst nur wiederholte Fehlversuche
      // und wird vom Erfolg nie berührt.
      if (ok) return null;

      const ip = getClientIp(req);
      if (limiter.isBlocked(ip)) {
        return apiError(opts.rateLimited ?? 'Too many attempts. Try again later.', 429);
      }
      limiter.recordFailure(ip);
      return apiError('Unauthorized.', 401);
    },
    reset() {
      limiter.clear();
    },
  };
}
