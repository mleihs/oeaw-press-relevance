import * as Sentry from '@sentry/nextjs';
import {
  apiError,
  createSSEStream,
  sseResponse,
  withApiError,
} from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth/require';
import { log } from '@/lib/server/log';
import {
  syncUpcomingEvents,
  EVENTS_SYNC_DISABLED_MESSAGE,
} from '@/lib/server/events/sync';
import { getEnv } from '@/lib/server/env';

// MySQL-Sync + optionaler LLM-Location-Fallback laufen zusammen mehrere
// Minuten; volles Serverless-Budget wie /api/analysis/batch.
export const maxDuration = 300;

/**
 * POST /api/events/sync — als SSE-Stream (Perf-Audit #7). Der frühere
 * synchrone JSON-Call schickte während des gesamten Laufs keine Bytes und
 * riss damit bei langen Läufen das Cloudflare-100-s-Limit. Jetzt: sofortige
 * Stream-Antwort, Progress-Frames aus dem Sync + der 25-s-Heartbeat aus
 * createSSEStream halten die Verbindung offen.
 *
 * Event-Schema (jeweils `data` als JSON):
 *   started   { llm_fallback: boolean }
 *   locations { llm_locations_filled: number }         — nach dem LLM-Fallback
 *   synced    { imported, updated, pruned: number }    — nach Upsert + Prune
 *   done      EventsSyncResult                          — komplettes Ergebnis
 *   error     { error: string }                         — statt done
 */
export const POST = withApiError(async () => {
  // Die Route mutiert die Events-Tabelle und kann über den Location-Fallback
  // LLM-Guthaben ausgeben → angemeldete Identität Pflicht (Muster
  // /api/analysis/batch). requireUser wirft ApiAuthError → 401/403.
  await requireUser();

  const env = getEnv();

  // Config-Pre-Check VOR dem Stream-Start: die 503 geht als Plain-JSON raus,
  // damit der Client sie über den normalen !ok-Pfad zeigen kann (Muster
  // /api/social/refresh mit APIFY_TOKEN). Wortlaut-SSOT in events/sync.ts.
  if (!env.WEBDB_MYSQL_HOST) {
    return apiError(EVENTS_SYNC_DISABLED_MESSAGE, 503);
  }

  const { stream, send, close } = createSSEStream();

  // Fire-and-forget: der Sync läuft weiter, während die Stream-Response
  // sofort rausgeht. Hinter dem Stream greift withApiError nicht mehr —
  // Fehler (mysql2-ECONNREFUSED/ETIMEDOUT, Credential-Drift, …) müssen hier
  // selbst geloggt, an Sentry gemeldet und als error-Frame emittiert werden.
  void (async () => {
    try {
      send('started', { llm_fallback: env.EVENTS_LLM_FALLBACK_ENABLED });
      const result = await syncUpcomingEvents({
        mysqlHost: env.WEBDB_MYSQL_HOST,
        llmFallbackEnabled: env.EVENTS_LLM_FALLBACK_ENABLED,
        onProgress: send,
      });
      send('done', result);
    } catch (err) {
      Sentry.captureException(err, {
        tags: { seam: 'sse_background', route: '/api/events/sync' },
      });
      log.error('events_sync_failed', { err });
      send('error', {
        error:
          err instanceof Error
            ? err.message
            : 'Unbekannter Fehler beim Events-Sync',
      });
    } finally {
      close();
    }
  })();

  return sseResponse(stream);
});
