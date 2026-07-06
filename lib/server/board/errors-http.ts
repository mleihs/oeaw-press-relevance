import 'server-only';

import { apiError } from '@/lib/server/http';
import {
  AttachmentNotFoundError,
  AttachmentRejectedError,
  BoardConflictError,
  BoardForbiddenError,
  BoardNotFoundError,
  CardItemNotFoundError,
  CardNotFoundError,
  CommentNotFoundError,
  ColumnNotEmptyError,
  ColumnNotFoundError,
  ItemAlreadyConvertedError,
  ReferenceNotFoundError,
  ReferenceTargetError,
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
  if (err instanceof BoardForbiddenError) {
    return apiError(err.message, 403);
  }
  if (err instanceof AttachmentRejectedError) {
    return apiError(err.message, err.status);
  }
  if (err instanceof ReferenceTargetError) {
    return apiError(err.message, 400);
  }
  if (
    err instanceof BoardNotFoundError ||
    err instanceof ColumnNotFoundError ||
    err instanceof CardNotFoundError ||
    err instanceof CardItemNotFoundError ||
    err instanceof CommentNotFoundError ||
    err instanceof AttachmentNotFoundError ||
    err instanceof ReferenceNotFoundError
  ) {
    return apiError(err.message, 404);
  }
  return null;
}
