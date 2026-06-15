// Social-feature errors, centralized so route handlers map them to the right
// status (503 / 409 / 400) by type instead of by string-matching messages.
// Mirrors lib/server/events/errors.ts.

/** APIFY_TOKEN missing — the sync/refresh can't run. Route → 503. */
export class SocialSyncConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SocialSyncConfigError';
  }
}

/** Channel with this handle already exists. Route → 409. */
export class SocialChannelConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SocialChannelConflictError';
  }
}

/** Input is not a parseable Instagram handle/URL. Route → 400. */
export class InvalidInstagramHandleError extends Error {
  constructor(input: string) {
    super(`Ungültiger Instagram-Handle: "${input}"`);
    this.name = 'InvalidInstagramHandleError';
  }
}
