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

/**
 * Wraps a board route handler so domain errors map to their HTTP status and
 * everything else rethrows (to `withApiError` → 500). Replaces the repeated
 *   try { … } catch (err) { const r = boardErrorToResponse(err); if (r) return r; throw err; }
 * boilerplate in every board route. Compose it INSIDE `withApiError` so the
 * CSRF/validation/auth handling still wraps it:
 *   export const PATCH = withApiError(withBoardErrors(async (req, ctx) => { … }));
 */
export function withBoardErrors<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response> | Response,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      const res = boardErrorToResponse(err);
      if (res) return res;
      throw err;
    }
  };
}
