import 'server-only';
import { createBearerGuard } from '@/lib/server/bearer-auth';
import { z } from 'zod';
import { withApiError } from '@/lib/server/http';

// HTTP-Rahmen der TYPO3-Bridge (/api/typo3-bridge/*). Gegenüber steht die
// Chrome-Extension „ÖAW TYPO3 Toolkit" (Event-Assistent). Vertrag:
// docs/TYPO3_BRIDGE.md.
//
// Auth: Bearer TYPO3_BRIDGE_TOKEN, nicht das Gate-Cookie (die Routen liegen in
// lib/shared/gate.ts unter PUBLIC_PREFIXES). Env unset → 503, die Bridge ist
// dann aus. Vergleich und Fehlversuchs-Limiter: lib/server/bearer-auth.ts.
//
// CORS: Die Extension ruft mit host_permissions und braucht CORS dann nicht.
// Lehnt die Redakteurin den Host-Zugriff ab, fällt sie auf normales CORS
// zurück (sidepanel.js, saveSettings). Deshalb trägt JEDE Antwort, auch 401,
// 503 und 500, die CORS-Header: sonst sähe das Panel statt „Token abgelehnt"
// nur „nicht erreichbar". `*` ist hier vertretbar, weil die Bridge keine
// Cookies auswertet: ohne Token kommt keine Seite an Daten, egal von wo.

const guard = createBearerGuard({
  secret: () => process.env.TYPO3_BRIDGE_TOKEN,
  notConfigured: 'TYPO3-Bridge ist nicht konfiguriert (TYPO3_BRIDGE_TOKEN fehlt).',
});

/** Test-Hook: Limiter-State zwischen Vitest-Fällen leeren. */
export function _resetBridgeRateLimiter(): void {
  guard.reset();
}

/** Extension-Origins werden gespiegelt (mit `Vary: Origin`), alles andere `*`. */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  const allowOrigin = origin?.startsWith('chrome-extension://') ? origin : '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function withCors(req: Request, res: Response): Response {
  for (const [k, v] of Object.entries(corsHeaders(req))) res.headers.set(k, v);
  // Entwürfe und Eventdaten sind Arbeitsstände: nie aus einem Zwischenspeicher.
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

/** Preflight: 204 ohne Token, nur die CORS-Header. */
export function bridgeOptions(req: Request): Response {
  return withCors(req, new Response(null, { status: 204 }));
}

/**
 * Rahmen jeder Bridge-Route: Token prüfen, Handler ausführen, unerwartete
 * Fehler als 500 `{ error }` (withApiError), und auf allem die CORS-Header.
 * csrf:false wie beim Nacht-Cron: die Extension authentifiziert per Bearer,
 * nicht per Ambient-Cookie, und schickt als Origin `chrome-extension://…`,
 * das die Same-Origin-Prüfung sonst als fremd abwiese.
 */
export function bridgeRoute<Ctx extends unknown[]>(
  handler: (req: Request, ...ctx: Ctx) => Promise<Response> | Response,
): (req: Request, ...ctx: Ctx) => Promise<Response> {
  const inner = withApiError(
    async (req: Request, ...ctx: Ctx) => guard.assert(req) ?? handler(req, ...ctx),
    { csrf: false },
  );
  return async (req: Request, ...ctx: Ctx) => withCors(req, await inner(req, ...ctx));
}

const eventIdSchema = z.uuid();

/** Event-ids sind UUIDs. Eine andere id kann es nicht geben: 404, nicht 400,
 *  damit Postgres sie gar nicht erst als ungültige UUID ablehnt. */
export function isBridgeEventId(id: string): boolean {
  return eventIdSchema.safeParse(id).success;
}
