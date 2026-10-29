// Fehlerklassen der API-Schicht, ohne Abhängigkeit auf Next. lib/server/http.ts
// re-exportiert sie; `withApiError` bildet sie auf 400/401/403 ab.

/**
 * Thrown by the validate* helpers when input fails its zod schema.
 * `withApiError` catches it and returns a deterministic 400 (not the 500
 * `route_unhandled_error` path). The message is the first zod issue, which
 * keeps parity with the per-route
 * `apiError(parsed.error.issues[0]?.message ?? '...', 400)` block these
 * helpers replace (ADR 0018).
 */
export class ApiValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiValidationError';
  }
}

/**
 * Thrown by `requireUser()`/`requireAdmin()` (lib/server/auth/require.ts)
 * when a route needs an authenticated Supabase-Auth identity. `withApiError`
 * maps it to a structured 401/403 instead of the 500 fallthrough — the same
 * contract ApiValidationError has for 400s.
 */
export class ApiAuthError extends Error {
  readonly status: 401 | 403;
  constructor(message: string, status: 401 | 403) {
    super(message);
    this.name = 'ApiAuthError';
    this.status = status;
  }
}
