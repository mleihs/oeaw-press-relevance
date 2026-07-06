/**
 * Publication-feature errors. Used by both the read paths (fetch.ts) and
 * the mutation paths (decisions.ts, flag.ts) so they land in the same 404
 * mapping in route handlers.
 */
import 'server-only';
export class PublicationNotFoundError extends Error {
  constructor(reason?: string) {
    super(reason ?? 'Publication not found');
    this.name = 'PublicationNotFoundError';
  }
}
