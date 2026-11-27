import 'server-only';
import { createBearerGuard } from '@/lib/server/bearer-auth';

// Bearer-Auth für die unbeaufsichtigte Ingest-Route (POST /api/ingest/run) und
// die Nachtbewertung (POST /api/scoring/run, GET /api/scoring/runs[/<id>]).
// Der Nacht-Cron auf dem VPS schickt `Authorization: Bearer <INGEST_CRON_SECRET>`.
// Das ist eine Maschine-zu-Maschine-Grenze — KEIN requireUser() (kein Login),
// KEIN Gate-Cookie (die Route liegt in PUBLIC_PATHS). Das Secret IST die Grenze.
// Vergleich, Limiter und Reihenfolge: lib/server/bearer-auth.ts.

const guard = createBearerGuard({
  secret: () => process.env.INGEST_CRON_SECRET,
  notConfigured: 'Ingest cron is not configured (INGEST_CRON_SECRET unset).',
});

/**
 * Prüft das Bearer-Token gegen INGEST_CRON_SECRET.
 * Rückgabe: eine Fehler-`Response` bei Ablehnung, sonst `null` (weiter).
 *   - env unset             → 503 (Feature nicht konfiguriert, klar unterscheidbar)
 *   - korrektes Secret      → null (immer, auch bei geblockter IP)
 *   - Fehlversuch, IP-Limit → 429
 *   - fehlend/falsch        → 401
 */
export function assertCronSecret(req: Request): Response | null {
  return guard.assert(req);
}

/** Test-Hook: Limiter-State zwischen Vitest-Fällen leeren. */
export function _resetCronRateLimiter(): void {
  guard.reset();
}
