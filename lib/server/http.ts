import { NextResponse } from 'next/server';

/**
 * Uniform JSON error response. Used everywhere route handlers need to
 * short-circuit with a 4xx/5xx — single shape `{ error: string }`.
 */
export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * CSRF guard: rejects state-changing requests whose Origin (or, falling
 * back, Referer) host does not match the request's Host header. Browsers
 * always send Origin on cross-origin POST/PUT/PATCH/DELETE, so this stops
 * a third-party page from triggering an authenticated mutation via the
 * gate cookie. Returns the 403 Response on mismatch, or `null` to let the
 * handler proceed.
 *
 * Wired into `withApiError` below for every mutating method, so individual
 * routes don't need to opt in.
 */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function assertSameOrigin(req: Request): Response | null {
  const host = req.headers.get('host');
  if (!host) return apiError('Missing host header', 403);

  const origin = req.headers.get('origin');
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return apiError('Cross-origin request not allowed', 403);
    }
    if (originHost !== host) {
      return apiError('Cross-origin request not allowed', 403);
    }
    return null;
  }

  // Origin missing. Fall back to Referer for older clients / non-CORS POSTs.
  const referer = req.headers.get('referer');
  if (referer) {
    let refererHost: string;
    try {
      refererHost = new URL(referer).host;
    } catch {
      return apiError('Cross-origin request not allowed', 403);
    }
    if (refererHost !== host) {
      return apiError('Cross-origin request not allowed', 403);
    }
    return null;
  }

  // Strict posture: no Origin and no Referer on a mutating request gets blocked.
  return apiError('Missing origin/referer header', 403);
}

/**
 * Creates a ReadableStream + send/close helpers for SSE responses. The
 * `cancel()` handler is critical: when the consumer aborts (client
 * disconnect or fetch timeout) the controller is marked closed so
 * subsequent send/close calls become no-ops instead of throwing
 * "Invalid state: Controller is already closed". That error used to
 * escape as an unhandledRejection and, accumulated over many batches,
 * killed the dev server (2026-05-01 incident, ~88 enrichment batches in).
 */
export function createSSEStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
    cancel() {
      closed = true;
      controller = null;
    },
  });

  function send(event: string, data: unknown) {
    if (closed || !controller) return;
    try {
      controller.enqueue(
        encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
      );
    } catch {
      // Race between cancel() and a pending enqueue — treat as closed.
      closed = true;
      controller = null;
    }
  }

  function close() {
    if (closed || !controller) return;
    try {
      controller.close();
    } catch {
      // Already closed by the consumer side.
    }
    closed = true;
    controller = null;
  }

  return { stream, send, close };
}

/**
 * Maps a thrown value to an `apiError` payload. Use in route catch blocks
 * to keep handlers focused on the happy path. Status defaults to 500;
 * pass another for validation/billing/auth/etc. Optional `fallback`
 * overrides the "Unknown error" string used when `err` is not an Error
 * instance (e.g. set to "Invalid request" for JSON-parse catches).
 */
export function errorToApiResponse(
  err: unknown,
  status = 500,
  fallback = 'Unknown error',
) {
  const message = err instanceof Error ? err.message : fallback;
  return apiError(message, status);
}

/**
 * Higher-order wrapper that turns any uncaught throw inside a route
 * handler into a 500 `{ error: <message> }` response via
 * `errorToApiResponse`. Use to drop the try/catch boilerplate from
 * route bodies — the happy path stays linear, validation errors remain
 * explicit `return apiError(...)` early-returns.
 *
 * For sub-steps that need a non-500 status or custom fallback (JSON
 * parse → 400 "Invalid request", payload validation → 400 with a
 * specific error class), keep an inner try/catch and call
 * `errorToApiResponse(err, status, fallback)` directly.
 */
export function withApiError<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response> | Response,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      const req = args[0];
      if (req instanceof Request && MUTATING_METHODS.has(req.method.toUpperCase())) {
        const csrfFail = assertSameOrigin(req);
        if (csrfFail) return csrfFail;
      }
      return await handler(...args);
    } catch (err) {
      return errorToApiResponse(err);
    }
  };
}
