/**
 * Event-feature errors. Used by both the read paths (sync.ts: re-import) and
 * the mutation paths (flag.ts, decisions.ts) so they land in the same 404
 * mapping in route handlers — mirrors lib/server/publications/errors.ts.
 */
import 'server-only';
export class EventNotFoundError extends Error {
  constructor(reason?: string) {
    super(reason ?? 'Event not found');
    this.name = 'EventNotFoundError';
  }
}
