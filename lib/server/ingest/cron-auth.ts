import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { apiError } from '@/lib/server/http';
import { createRateLimiter, getClientIp } from '@/lib/server/rate-limit';

// Bearer-Auth für die unbeaufsichtigte Ingest-Route (POST /api/ingest/run).
// Der Nacht-Cron auf dem VPS schickt `Authorization: Bearer <INGEST_CRON_SECRET>`.
// Das ist eine Maschine-zu-Maschine-Grenze — KEIN requireUser() (kein Login),
// KEIN Gate-Cookie (die Route liegt in PUBLIC_PATHS). Das Secret IST die Grenze.
//
// Konstante-Zeit-Vergleich: beide Seiten werden auf SHA-256 gehasht (feste
// 32-Byte-Länge) und mit timingSafeEqual verglichen, damit weder Länge noch
// Inhalt des Secrets über die Antwortzeit durchsickern.

// 5 Fehlversuche / 15 min pro IP → 429. Bremst Brute-Force gegen das Secret.
const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 15 * 60_000 });

function sha256(s: string): Buffer {
  return createHash('sha256').update(s, 'utf8').digest();
}

/**
 * Prüft das Bearer-Token gegen INGEST_CRON_SECRET.
 * Rückgabe: eine Fehler-`Response` bei Ablehnung, sonst `null` (weiter).
 *   - env unset          → 503 (Feature nicht konfiguriert, klar unterscheidbar)
 *   - IP rate-limited    → 429
 *   - fehlend/falsch     → 401
 */
export function assertCronSecret(req: Request): Response | null {
  const secret = process.env.INGEST_CRON_SECRET?.trim();
  if (!secret) {
    return apiError('Ingest cron is not configured (INGEST_CRON_SECRET unset).', 503);
  }

  const ip = getClientIp(req);
  if (limiter.isBlocked(ip)) {
    return apiError('Too many attempts. Try again later.', 429);
  }

  const header = req.headers.get('authorization') ?? '';
  const presented = /^Bearer\s+(.+)$/i.exec(header.trim())?.[1]?.trim() ?? '';

  // sha256 gibt beidseitig 32 Byte → timingSafeEqual wirft nie an der Länge.
  const ok = presented.length > 0 && timingSafeEqual(sha256(presented), sha256(secret));
  if (!ok) {
    limiter.recordFailure(ip);
    return apiError('Unauthorized.', 401);
  }
  limiter.reset(ip);
  return null;
}

/** Test-Hook: Limiter-State zwischen Vitest-Fällen leeren. */
export function _resetCronRateLimiter(): void {
  limiter.clear();
}
