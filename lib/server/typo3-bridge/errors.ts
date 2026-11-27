import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { apiError } from '@/lib/server/http';
import { log } from '@/lib/server/log';
import { DraftNotConfiguredError, DraftRefusedError, DraftUnusableError } from './draft';

// Fehler des Entwurfs → HTTP-Antwort. Das Panel (sidepanel.js, api()) liest den
// Status, nicht den Text: 401/403 zeigt es als „Token abgelehnt", 503 als
// „Schnittstelle abgeschaltet". Ein Problem zwischen PR-Tool und Anthropic
// darf deshalb nie als 401/403 ankommen, sonst sucht die Redakteurin den
// Fehler an ihrem Token. 503 nur, wenn der Entwurf tatsächlich nicht
// eingerichtet ist (kein ANTHROPIC_API_KEY).
//
//   kein ANTHROPIC_API_KEY          → 503
//   Ablehnung (stop_reason refusal) → 422
//   Rate-Limit bei Anthropic        → 429
//   Zeitüberschreitung              → 504
//   alles andere von Anthropic      → 502 (Auth, Guthaben, Überlast, 400, Netz)
//   unbrauchbare Antwort            → 502
// Unbekannte Fehler gibt die Funktion nicht ab (null): sie fallen in
// withApiError als 500 und landen in Sentry.
//
// Nur die Ablehnung spricht vom Gegenstand: beim Event-Assistenten ist es ein
// Entwurf, im News-Wizard heißen so lokale Zwischenstände, dort lehnt Claude
// Vorschläge ab.

export const DRAFT_REFUSED_MESSAGE = 'Claude hat diesen Entwurf abgelehnt. Bitte den Text von Hand anlegen.';
export const NEWS_ASSIST_REFUSED_MESSAGE = 'Claude hat Vorschläge zu diesem Beitrag abgelehnt. Bitte die Felder von Hand ausfüllen.';

export function draftErrorResponse(err: unknown, refusedMessage: string = DRAFT_REFUSED_MESSAGE): Response | null {
  if (err instanceof DraftNotConfiguredError) return apiError(err.message, 503);
  if (err instanceof DraftRefusedError) {
    log.warn('typo3_bridge_draft_refused', { category: err.category });
    return apiError(refusedMessage, 422);
  }
  if (err instanceof DraftUnusableError) {
    log.warn('typo3_bridge_draft_unusable', { message: err.message });
    return apiError(err.message, 502);
  }
  if (!(err instanceof Anthropic.APIError)) return null;

  log.warn('typo3_bridge_draft_anthropic_error', { status: err.status, type: err.type, message: err.message });
  // Reihenfolge: Unterklassen vor ihren Basisklassen. Im TypeScript-SDK ist
  // APIConnectionTimeoutError eine APIConnectionError, und die ist eine APIError.
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return apiError('Claude hat nicht rechtzeitig geantwortet. Bitte noch einmal versuchen.', 504);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return apiError('Claude ist vom PR-Tool aus nicht erreichbar.', 502);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return apiError('Claude ist gerade ausgelastet (Rate-Limit). Bitte in einer Minute noch einmal.', 429);
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return apiError('Anthropic lehnt den API-Key des PR-Tools ab.', 502);
  }
  if (err.status === 402) {
    return apiError('Das Anthropic-Guthaben des PR-Tools ist aufgebraucht.', 502);
  }
  if (err instanceof Anthropic.InternalServerError) {
    return apiError(`Claude meldet einen Serverfehler (${err.status}). Bitte später noch einmal.`, 502);
  }
  return apiError(`Claude meldet Fehler ${err.status ?? '?'}.`, 502);
}
