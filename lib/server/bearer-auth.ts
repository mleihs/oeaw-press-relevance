import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { apiError } from '@/lib/server/http';
import { createRateLimiter, getClientIp } from '@/lib/server/rate-limit';

// Bearer-Prüfung gegen Secrets aus der Env, für Maschinen- und Werkzeug-
// Zugänge ohne Gate-Cookie: den Nacht-Cron (INGEST_CRON_SECRET, lib/server/
// ingest/cron-auth.ts) und die TYPO3-Bridge der Chrome-Extension
// (TYPO3_BRIDGE_TOKEN und benannte TYPO3_BRIDGE_TOKENS,
// lib/server/typo3-bridge/http.ts). Beide Routen liegen gate-öffentlich in
// lib/shared/gate.ts; das Secret IST die Grenze.
//
// Konstante-Zeit-Vergleich: beide Seiten werden auf SHA-256 gehasht (feste
// 32-Byte-Länge) und mit timingSafeEqual verglichen, damit weder Länge noch
// Inhalt des Secrets über die Antwortzeit durchsickern.

/** Ein Secret mit Namen fürs Log. */
export interface NamedSecret {
  label: string;
  secret: string;
}

interface GuardTexts {
  /** Text der 503-Antwort, wenn kein Secret gesetzt ist. */
  notConfigured: string;
  /** Text der 429-Antwort nach zu vielen Fehlversuchen. Die Bridge zeigt ihn
   *  der Redakteurin im Panel an, der Cron braucht ihn nur fürs Log. */
  rateLimited?: string;
}

/**
 * Secrets werden bei jedem Aufruf gelesen (nicht beim Import), damit Tests die
 * Env umschalten können. Leer oder unset heißt: Zugang aus.
 *   - `secret`:  ein Secret (Cron); sein Name ist „default“.
 *   - `secrets`: mehrere benannte (Bridge); jedes gilt, der Name des
 *                passenden kommt in `check` zurück.
 */
export type BearerGuardOptions = GuardTexts &
  ({ secret: () => string | undefined; secrets?: never } | { secrets: () => NamedSecret[]; secret?: never });

export type BearerCheck = { ok: true; label: string } | { ok: false; response: Response };

export interface BearerGuard {
  /** Fehler-`Response` bei Ablehnung, sonst `null` (weiter). */
  assert(req: Request): Response | null;
  /** Wie `assert`, nennt bei Erfolg aber den Namen des passenden Secrets. */
  check(req: Request): BearerCheck;
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
 *   - kein Secret gesetzt   → 503 (Zugang nicht konfiguriert, klar unterscheidbar)
 *   - korrektes Secret      → weiter (immer, auch bei geblockter IP)
 *   - Fehlversuch, IP-Limit → 429
 *   - fehlend/falsch        → 401
 */
export function createBearerGuard(opts: BearerGuardOptions): BearerGuard {
  const limiter = createRateLimiter({ maxAttempts: 5, windowMs: 15 * 60_000 });

  const secretsNow = (): NamedSecret[] => {
    const all = opts.secrets ? opts.secrets() : [{ label: 'default', secret: opts.secret() ?? '' }];
    return all.map((s) => ({ label: s.label, secret: s.secret.trim() })).filter((s) => s.secret);
  };

  const check = (req: Request): BearerCheck => {
    const secrets = secretsNow();
    if (secrets.length === 0) return { ok: false, response: apiError(opts.notConfigured, 503) };

    // sha256 gibt beidseitig 32 Byte → timingSafeEqual wirft nie an der Länge.
    // Verglichen wird mit ALLEN Secrets, auch nach einem Treffer: die
    // Antwortzeit verrät so nicht, das wievielte gepasst hat.
    const presented = bearerTokenOf(req);
    let label: string | null = null;
    if (presented.length > 0) {
      const digest = sha256(presented);
      for (const s of secrets) {
        const hit = timingSafeEqual(digest, sha256(s.secret));
        if (hit && label === null) label = s.label;
      }
    }

    // Secret ZUERST prüfen, Limiter erst danach: getClientIp liest den ersten
    // X-Forwarded-For-Eintrag, und den bestimmt der CLIENT (Proxies hängen
    // nur an). Stünde der Limiter vor der Prüfung, könnte ein Außenstehender
    // mit 5 Fehlversuchen unter gefälschtem XFF den echten Aufrufer
    // aussperren (429 trotz korrektem Secret). Wer das Secret hat, kommt
    // deshalb IMMER durch; der Limiter bremst nur wiederholte Fehlversuche
    // und wird vom Erfolg nie berührt.
    if (label !== null) return { ok: true, label };

    const ip = getClientIp(req);
    if (limiter.isBlocked(ip)) {
      return { ok: false, response: apiError(opts.rateLimited ?? 'Too many attempts. Try again later.', 429) };
    }
    limiter.recordFailure(ip);
    return { ok: false, response: apiError('Unauthorized.', 401) };
  };

  return {
    assert(req) {
      const r = check(req);
      return r.ok ? null : r.response;
    },
    check,
    reset() {
      limiter.clear();
    },
  };
}
