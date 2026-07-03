import 'server-only';

import { apiError } from '@/lib/server/http';
import {
  BoardConflictError,
  BoardNotFoundError,
  CardItemNotFoundError,
  CardNotFoundError,
  ColumnNotEmptyError,
  ColumnNotFoundError,
  ItemAlreadyConvertedError,
} from './errors';

/**
 * Mappt Board-Domänenfehler auf HTTP-Antworten. Gibt null zurück, wenn der
 * Fehler keiner Board-Domäne angehört (dann rethrown der Aufrufer -> 500 via
 * withApiError). Die Routen nutzen das im catch:
 *   catch (err) { const r = boardErrorToResponse(err); if (r) return r; throw err; }
 */
export function boardErrorToResponse(err: unknown): Response | null {
  if (
    err instanceof ColumnNotEmptyError ||
    err instanceof ItemAlreadyConvertedError ||
    err instanceof BoardConflictError
  ) {
    return apiError(err.message, 409);
  }
  if (
    err instanceof BoardNotFoundError ||
    err instanceof ColumnNotFoundError ||
    err instanceof CardNotFoundError ||
    err instanceof CardItemNotFoundError
  ) {
    return apiError(err.message, 404);
  }
  return null;
}
